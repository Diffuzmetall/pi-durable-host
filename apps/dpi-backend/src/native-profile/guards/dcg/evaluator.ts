import { type ChildProcessByStdio, spawn } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Readable, Writable } from "node:stream";

export type DcgDecision =
	| { kind: "allow" }
	| { kind: "deny"; reason: string; ruleId?: string; packId?: string }
	| { kind: "unavailable"; category: string; reason: string };

export interface DcgEvaluationInput {
	command: string;
	cwd: string;
}

export interface DcgEvaluationContext {
	readonly abortSignal?: AbortSignal;
}

export interface DcgEvaluator {
	evaluate(input: DcgEvaluationInput, context?: DcgEvaluationContext): Promise<DcgDecision>;
	close(context?: DcgEvaluationContext): Promise<void>;
}

export interface DcgEvaluatorOptions {
	/** Trusted absolute executable, selected once at construction. Defaults to startup DCG_BIN or ~/.local/bin/dcg. */
	binaryPath?: string;
	/** Host-owned integer in [100, 30000]; defaults to 30000. */
	timeoutMs?: number;
	/** Fresh host environment for every check; never the submitted shell environment. */
	envSource?: () => Readonly<Record<string, string | undefined>>;
}

const INPUT_CAP = 64 * 1024;
const STDOUT_CAP = 1024 * 1024;
const STDERR_CAP = 64 * 1024;
const REASONS = {
	input: "Invalid DCG evaluation input.",
	policy: "Invalid host DCG policy.",
	spawn: "DCG could not be started or failed during evaluation.",
	response: "DCG did not return an unambiguous validated decision.",
	timeout: "DCG evaluation timed out.",
	overflow: "DCG evaluation exceeded its output limit.",
	aborted: "DCG evaluation was cancelled.",
	closed: "DCG evaluator is closed.",
	kill: "DCG termination request failed.",
};
type FailureCategory = keyof typeof REASONS;
function unavailable(category: FailureCategory): DcgDecision {
	return { kind: "unavailable", category, reason: REASONS[category] };
}
function validText(text: unknown): text is string {
	return typeof text === "string" && !text.includes("\0") && text.isWellFormed();
}
function validPath(path: unknown): path is string {
	return validText(path) && isAbsolute(path);
}

// JSON.parse validates grammar first. Scan structural tokens, skipping strings,
// to reject duplicate decoded top-level keys (including identical values).
function hasDuplicateKeys(text: string): boolean {
	const keys = new Set<string>();
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "{" || text[i] === "[") depth++;
		else if (text[i] === "}" || text[i] === "]") depth--;
		else if (text[i] === '"') {
			const start = i++;
			for (; i < text.length && text[i] !== '"'; i++) {
				if (text[i] === "\\") i++;
			}
			let next = i + 1;
			while (next < text.length && /\s/.test(text[next] ?? "")) next++;
			if (depth === 1 && text[next] === ":") {
				const key = JSON.parse(text.slice(start, i + 1)) as string;
				if (keys.has(key)) return true;
				keys.add(key);
			}
		}
	}
	return false;
}

function classify(
	stdout: Uint8Array,
	stderrBytes: number,
	command: string,
	code: number | null,
	signal: NodeJS.Signals | null,
): DcgDecision {
	if (signal !== null || stderrBytes !== 0) return unavailable("response");
	let parsed: unknown;
	try {
		const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(stdout);
		parsed = JSON.parse(text);
		if (hasDuplicateKeys(text)) return unavailable("response");
	} catch {
		return unavailable("response");
	}
	if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return unavailable("response");
	const response = parsed as Record<string, unknown>;
	if (
		response.schema_version !== 1 ||
		response.robot_mode !== true ||
		response.dcg_version !== "0.15.3" ||
		response.command !== command
	)
		return unavailable("response");
	if (response.decision === "allow" && code === 0 && (!Object.hasOwn(response, "mode") || response.mode === null))
		return { kind: "allow" };
	// The operator's policy explicitly authorizes warn/log decisions. Preserve all
	// envelope/exit validation; ask, malformed and unavailable responses still fail closed.
	if (code === 0 && ((response.decision === "warn" && response.mode === "warn") ||
		(response.decision === "log" && response.mode === "log")))
		return { kind: "allow" };
	if (response.decision !== "deny" || code !== 1 || response.mode !== "deny") return unavailable("response");
	return {
		kind: "deny",
		reason:
			typeof response.reason === "string" && response.reason.length ? response.reason : "DCG denied this command.",
		...(typeof response.rule_id === "string" ? { ruleId: response.rule_id } : {}),
		...(typeof response.pack_id === "string" ? { packId: response.pack_id } : {}),
	};
}

interface ActiveCheck {
	done: Promise<DcgDecision>;
	stop(category: FailureCategory): void;
}

/** Direct DCG 0.15.3/schema 1 checks. Construction/import has no process effects. No permission cache or retries. */
export function createDcgEvaluator(options: DcgEvaluatorOptions = {}): DcgEvaluator {
	const binaryPath =
		options.binaryPath === undefined
			? (process.env.DCG_BIN ?? join(homedir(), ".local", "bin", "dcg"))
			: options.binaryPath;
	const timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs;
	const envSource = options.envSource === undefined ? () => process.env : options.envSource;
	const active = new Set<ActiveCheck>();
	let closed = false;
	let closing: Promise<void> | undefined;

	async function evaluate(input: DcgEvaluationInput, context: DcgEvaluationContext = {}): Promise<DcgDecision> {
		if (closed) return unavailable("closed");
		let command: string;
		let cwd: string;
		let signal: AbortSignal | undefined;
		let env: NodeJS.ProcessEnv;
		try {
			({ command, cwd } = input);
			signal = context.abortSignal;
			if (signal !== undefined && !(signal instanceof AbortSignal)) return unavailable("input");
			if (signal?.aborted) return unavailable("aborted");
			if (!validText(command) || Buffer.byteLength(command, "utf8") + 2 > INPUT_CAP || !validPath(cwd))
				return unavailable("input");
			if (!validPath(binaryPath) || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
				return unavailable("policy");
			const source = envSource();
			if (!source || typeof source !== "object" || Array.isArray(source)) return unavailable("policy");
			env = { ...source };
			for (const value of Object.values(env)) {
				if (value !== undefined && !validText(value)) return unavailable("policy");
			}
			if (!["", "0", "false", "no", "off"].includes((env.DCG_BYPASS ?? "").trim().toLowerCase()))
				return unavailable("policy");
		} catch {
			return unavailable("policy");
		}
		// A host callback can synchronously abort or initiate close.
		if (closed) return unavailable("closed");
		if (signal?.aborted) return unavailable("aborted");
		let child: ChildProcessByStdio<Writable, Readable, Readable>;
		try {
			child = spawn(binaryPath, ["--robot", "test", "--dialect", "posix", "--enforce-budget", "--stdin"], {
				shell: false,
				cwd,
				env,
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch {
			return unavailable("spawn");
		}
		const { promise: done, resolve: finish } = Promise.withResolvers<DcgDecision>();
		let forced: FailureCategory | undefined;
		let settled = false;
		let killRequested = false;
		let timer: ReturnType<typeof setTimeout>;
		let stdoutBytes = 0;
		let stderrBytes = 0;
		const chunks: Buffer[] = [];
		const record: ActiveCheck = { done, stop };
		active.add(record);

		// A kill request (including a failed request) is not termination evidence.
		// Keep ownership until close, not exit; failed termination never grants allow.
		function stop(category: FailureCategory): void {
			if (settled) return;
			forced ??= category;
			if (killRequested) return;
			killRequested = true;
			try {
				if (!child.kill("SIGKILL")) forced = "kill";
			} catch {
				forced = "kill";
			}
		}
		function onAbort(): void {
			stop("aborted");
		}
		function onError(): void {
			if (!child.pid) forced ??= "spawn";
			else stop("spawn");
		}
		function onStdout(data: Buffer): void {
			if (forced) return;
			if (stdoutBytes + data.length > STDOUT_CAP) {
				stop("overflow");
				return;
			}
			stdoutBytes += data.length;
			chunks.push(data);
		}
		function onStderr(data: Buffer): void {
			if (forced) return;
			if (stderrBytes + data.length > STDERR_CAP) {
				stop("overflow");
				return;
			}
			stderrBytes += data.length; // Never retain raw stderr.
		}
		function onClose(code: number | null, exitSignal: NodeJS.Signals | null): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			child.removeListener("error", onError);
			child.removeListener("close", onClose);
			child.stdout.removeListener("data", onStdout);
			child.stderr.removeListener("data", onStderr);
			child.stdout.removeListener("error", onError);
			child.stderr.removeListener("error", onError);
			active.delete(record);
			const decision = forced
				? unavailable(forced)
				: signal?.aborted
					? unavailable("aborted")
					: closed
						? unavailable("closed")
						: classify(Buffer.concat(chunks, stdoutBytes), stderrBytes, command, code, exitSignal);
			chunks.length = 0;
			finish(decision);
		}
		child.on("error", onError);
		child.on("close", onClose);
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.stdin.on("error", onError);
		child.stdout.on("error", onError);
		child.stderr.on("error", onError);
		signal?.addEventListener("abort", onAbort, { once: true });
		timer = setTimeout(() => stop("timeout"), timeoutMs);
		if (signal?.aborted) stop("aborted");
		if (closed) stop("closed");
		try {
			child.stdin.end(Buffer.concat([Buffer.from(command, "utf8"), Buffer.from("\r\n")]));
		} catch {
			stop("spawn");
		}
		return done;
	}

	function close(_context?: DcgEvaluationContext): Promise<void> {
		if (!closing) {
			closed = true;
			const owned = [...active];
			closing = Promise.all(owned.map((record) => record.done)).then(() => {});
			for (const record of owned) record.stop("closed");
		}
		return closing;
	}
	return { evaluate, close };
}
