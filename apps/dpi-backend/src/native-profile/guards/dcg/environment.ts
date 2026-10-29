import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withoutAbortSignal } from "@earendil-works/chord/context";
import {
	type ExecutionEnv,
	ExecutionError,
	err,
	type FileSystem,
	type Result,
	type ShellExecOptions,
	type ShellExecResult,
} from "@earendil-works/pi-durable/env";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { SessionExecutionEnv, baseShellEnv } from "../../../session-env.js";
import { formatDcgDiagnostic } from "./diagnostics.js";
import { createDcgEvaluator, type DcgDecision, type DcgEvaluator, type DcgEvaluatorOptions } from "./evaluator.js";

export interface DcgExecutionEnvOptions {
	evaluator: DcgEvaluator;
}

export interface DcgEnvironmentTarget {
	cwd?: string;
}

export interface DcgEnvironmentFactoryOptions {
	defaultCwd?: string;
	evaluatorOptions?: DcgEvaluatorOptions;
	shellEnv?: Readonly<Record<string, string>>;
	/** Inert local Node subclass seam only; not a remote/custom production factory. */
	testOnlyCreateNodeEnv?: (options: { cwd: string; shellEnv: Readonly<Record<string, string>> }) => NodeExecutionEnv;
	testOnlyCreateEvaluator?: (options?: DcgEvaluatorOptions) => DcgEvaluator;
}

export interface DcgEnvironmentFactory {
	env(target: DcgEnvironmentTarget, context: Context): DcgExecutionEnv;
	cleanup(context: Context): Promise<void>;
}

function unavailable(category: string): DcgDecision {
	return { kind: "unavailable", category, reason: "The local DCG guard could not validate this invocation." };
}

function validateContext(context: Context): void {
	if (
		!context ||
		typeof context !== "object" ||
		(context.abortSignal !== undefined && !(context.abortSignal instanceof AbortSignal))
	) {
		throw new TypeError("Unsupported DCG execution context.");
	}
}

function localPath(path: string, base: string): string {
	if (typeof path !== "string" || path.includes("\0") || !path.isWellFormed())
		throw new TypeError("Unsupported local cwd.");
	let normalized = path;
	if (normalized === "~") normalized = homedir();
	else if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\")))
		normalized = join(homedir(), normalized.slice(2));
	else if (normalized.startsWith("file://")) {
		try {
			normalized = fileURLToPath(normalized);
		} catch {
			throw new TypeError("Unsupported local file URL cwd.");
		}
	} else if (
		/^[a-z][a-z\d+.-]*:/i.test(normalized) &&
		!(process.platform === "win32" && /^[a-z]:[\\/]/i.test(normalized))
	) {
		throw new TypeError("Unsupported remote or custom cwd.");
	}
	if (normalized.startsWith("\\\\")) throw new TypeError("Unsupported remote cwd.");
	return isAbsolute(normalized) ? resolve(normalized) : resolve(base, normalized);
}

function validateInner(inner: NodeExecutionEnv): void {
	if (!(inner instanceof NodeExecutionEnv) || inner.id !== "node:local")
		throw new TypeError("Only a local NodeExecutionEnv is supported.");
	localPath(inner.cwd, process.cwd());
}

function normalizedDecision(value: unknown): DcgDecision {
	if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable("decision");
	const decision = value as Record<string, unknown>;
	const kind = decision.kind;
	const keys = Object.keys(decision);
	if (kind === "allow" && keys.length === 1 && keys[0] === "kind") return { kind };
	if (kind === "deny" && keys.every((key) => ["kind", "reason", "ruleId", "packId"].includes(key))) {
		const { reason, ruleId, packId } = decision;
		if (
			typeof reason !== "string" ||
			(ruleId !== undefined && typeof ruleId !== "string") ||
			(packId !== undefined && typeof packId !== "string")
		)
			return unavailable("decision");
		return { kind, reason, ...(ruleId !== undefined ? { ruleId } : {}), ...(packId !== undefined ? { packId } : {}) };
	}
	if (kind === "unavailable" && keys.every((key) => ["kind", "category", "reason"].includes(key))) {
		const { category, reason } = decision;
		if (typeof category === "string" && typeof reason === "string") return { kind, category, reason };
	}
	return unavailable("decision");
}

/** Final exec boundary: check after all hooks/prefix/prepare, then delegate the captured submission without rewriting execution. */
export class DcgExecutionEnv implements ExecutionEnv {
	readonly #inner: NodeExecutionEnv;
	readonly #evaluator: DcgEvaluator;
	#closed = false;
	#closing: Promise<void> | undefined;
	readonly #active = new Set<Promise<DcgDecision>>();
	readonly #delegations = new Set<Promise<Result<ShellExecResult, ExecutionError>>>();

	readonly absolutePath: FileSystem["absolutePath"];
	readonly joinPath: FileSystem["joinPath"];
	readonly readTextFile: FileSystem["readTextFile"];
	readonly openTextLineReader: FileSystem["openTextLineReader"];
	readonly readTextLines: FileSystem["readTextLines"];
	readonly readBinaryFile: FileSystem["readBinaryFile"];
	readonly openBinaryReader: FileSystem["openBinaryReader"];
	readonly writeFile: FileSystem["writeFile"];
	readonly appendFile: FileSystem["appendFile"];
	readonly truncateFile: FileSystem["truncateFile"];
	readonly flushFile: FileSystem["flushFile"];
	readonly renameFile: FileSystem["renameFile"];
	readonly fileInfo: FileSystem["fileInfo"];
	readonly listDir: FileSystem["listDir"];
	readonly openDirReader: FileSystem["openDirReader"];
	readonly watch: FileSystem["watch"];
	readonly canonicalPath: FileSystem["canonicalPath"];
	readonly exists: FileSystem["exists"];
	readonly createDir: FileSystem["createDir"];
	readonly remove: FileSystem["remove"];
	readonly createTempDir: FileSystem["createTempDir"];
	readonly createTempFile: FileSystem["createTempFile"];

	constructor(inner: NodeExecutionEnv, { evaluator }: DcgExecutionEnvOptions) {
		validateInner(inner);
		if (!evaluator || typeof evaluator.evaluate !== "function" || typeof evaluator.close !== "function")
			throw new TypeError("A DCG evaluator with evaluate/close is required.");
		this.#inner = inner;
		this.#evaluator = evaluator;
		this.absolutePath = inner.absolutePath.bind(inner);
		this.joinPath = inner.joinPath.bind(inner);
		this.readTextFile = inner.readTextFile.bind(inner);
		this.openTextLineReader = inner.openTextLineReader.bind(inner);
		this.readTextLines = inner.readTextLines.bind(inner);
		this.readBinaryFile = inner.readBinaryFile.bind(inner);
		this.openBinaryReader = inner.openBinaryReader.bind(inner);
		this.writeFile = inner.writeFile.bind(inner);
		this.appendFile = inner.appendFile.bind(inner);
		this.truncateFile = inner.truncateFile.bind(inner);
		this.flushFile = inner.flushFile.bind(inner);
		this.renameFile = inner.renameFile.bind(inner);
		this.fileInfo = inner.fileInfo.bind(inner);
		this.listDir = inner.listDir.bind(inner);
		this.openDirReader = inner.openDirReader.bind(inner);
		this.watch = inner.watch.bind(inner);
		this.canonicalPath = inner.canonicalPath.bind(inner);
		this.exists = inner.exists.bind(inner);
		this.createDir = inner.createDir.bind(inner);
		this.remove = inner.remove.bind(inner);
		this.createTempDir = inner.createTempDir.bind(inner);
		this.createTempFile = inner.createTempFile.bind(inner);
	}

	get id(): string {
		return this.#inner.id;
	}
	get cwd(): string {
		return this.#inner.cwd;
	}
	set cwd(value: string) {
		this.#inner.cwd = value;
	}

	async exec(
		command: string | readonly string[],
		options: ShellExecOptions | undefined,
		context: Context,
	): Promise<Result<ShellExecResult, ExecutionError>> {
		let cwd: string | undefined;
		let captured: ShellExecOptions;
		let submission: string | readonly string[];
		let policyText: string;
		let signal: AbortSignal | undefined;
		const failure = (decision: DcgDecision): Result<ShellExecResult, ExecutionError> =>
			err(new ExecutionError("unknown", formatDcgDiagnostic(decision, { cwd })));
		const aborted = (): Result<ShellExecResult, ExecutionError> =>
			err(new ExecutionError("aborted", "DCG_UNAVAILABLE: evaluation cancelled; shell not executed."));
		try {
			validateContext(context);
			signal = context.abortSignal;
			if (signal?.aborted) return aborted();
			if (this.#closed) return failure(unavailable("closed"));
			validateInner(this.#inner);
			if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options)))
				return failure(unavailable("input"));
			// Capture ALL options, nested mutable records, and absolute effective cwd before any await.
			const base = localPath(this.#inner.cwd, process.cwd());
			captured = { ...options };
			if (captured.env !== undefined) captured.env = { ...captured.env };
			if (captured.spill !== undefined) captured.spill = { ...captured.spill };
			if (captured.cwd !== undefined && typeof captured.cwd !== "string") return failure(unavailable("input"));
			cwd = captured.cwd ? localPath(captured.cwd, base) : base;
			captured.cwd = cwd;
			if (typeof command === "string") {
				if (!command.isWellFormed() || command.includes("\0") || Buffer.byteLength(command) > 64 * 1024)
					return failure(unavailable("input"));
				submission = policyText = command;
			} else {
				if (!Array.isArray(command) || command.length === 0) return failure(unavailable("input"));
				const argv: string[] = [];
				const parts: string[] = [];
				let bytes = 0;
				for (const arg of command) {
					if (
						typeof arg !== "string" ||
						!arg.isWellFormed() ||
						arg.includes("\0") ||
						Buffer.byteLength(arg) > 64 * 1024
					)
						return failure(unavailable("input"));
					// Canonical POSIX single quoting is policy TEXT only. Never run this through a shell.
					const part = `'${arg.replaceAll("'", "'\\''")}'`;
					bytes += Buffer.byteLength(part) + (parts.length ? 1 : 0);
					if (bytes > 64 * 1024) return failure(unavailable("input"));
					argv.push(arg);
					parts.push(part);
				}
				if (!argv[0]) return failure(unavailable("input"));
				submission = argv;
				policyText = parts.join(" ");
			}
		} catch {
			return failure(unavailable("context"));
		}

		// Register before even an injected evaluator runs; a reentrant cleanup must own this check.
		const checking = Promise.resolve().then(() => {
			if (this.#closed) return unavailable("closed");
			if (signal?.aborted) return unavailable("aborted");
			return this.#evaluator.evaluate({ command: policyText, cwd }, { abortSignal: signal });
		});
		this.#active.add(checking);
		let decision: DcgDecision;
		try {
			decision = normalizedDecision(await checking);
		} catch {
			decision = unavailable("evaluation");
		} finally {
			this.#active.delete(checking);
		}
		if (signal?.aborted) return aborted();
		if (this.#closed) return failure(unavailable("closed"));
		if (decision.kind !== "allow") return failure(decision);
		// Own admission BEFORE invoking the inner executor, including synchronous throw/reentrant cleanup.
		// Native startup awaits filesystem/shell discovery before it can register a child PID.
		const delegation = Promise.withResolvers<Result<ShellExecResult, ExecutionError>>();
		this.#delegations.add(delegation.promise);
		try {
			// No asynchronous gap; preserve the captured submission/options and original context/callback.
			try {
				delegation.resolve(this.#inner.exec(submission, captured, context));
			} catch (error) {
				delegation.reject(error);
			}
			return await delegation.promise;
		} finally {
			this.#delegations.delete(delegation.promise);
		}
	}

	cleanup(context: Context): Promise<void> {
		if (!this.#closing) {
			this.#closed = true;
			const owned = [...this.#active];
			const delegations = [...this.#delegations];
			const mandatory =
				context && typeof context.value === "function" ? withoutAbortSignal(context) : BACKGROUND_CONTEXT;
			this.#closing = Promise.resolve().then(async () => {
				const errors: unknown[] = [];
				try {
					await this.#evaluator.close(mandatory);
				} catch (error) {
					errors.push(error);
				}
				await Promise.allSettled(owned);
				try {
					await this.#inner.cleanup(mandatory);
				} catch (error) {
					errors.push(error);
				}
				// Kill registered PIDs first, then join admitted startup/execution even if either cleanup failed.
				// A startup admitted before closure may finish naturally; exec has no default timeout.
				await Promise.allSettled(delegations);
				if (errors.length) throw new AggregateError(errors, "DCG environment cleanup failed.");
			});
		}
		return this.#closing;
	}
}

/** Cache environments by equivalent local cwd, never decisions. Every owned environment closes even if siblings fail. */
export function createDcgEnvironmentFactory(options: DcgEnvironmentFactoryOptions = {}): DcgEnvironmentFactory {
	const {
		defaultCwd = process.cwd(),
		evaluatorOptions,
		shellEnv = baseShellEnv(),
		testOnlyCreateNodeEnv = (options) => new SessionExecutionEnv(options),
		testOnlyCreateEvaluator = createDcgEvaluator,
	} = options;
	const base = localPath(defaultCwd, process.cwd());
	const cached = new Map<string, DcgExecutionEnv>();
	const resources = new Set<ExecutionEnv>();
	let closed = false;
	let closing: Promise<void> | undefined;
	return {
		env(target, context) {
			if (closed) throw new Error("DCG environment factory is closed.");
			validateContext(context);
			if (!target || typeof target !== "object" || Array.isArray(target))
				throw new TypeError("Unsupported local environment target.");
			const cwd = target.cwd === undefined ? base : localPath(target.cwd, base);
			let env = cached.get(cwd);
			if (!env) {
				const inner = testOnlyCreateNodeEnv({ cwd, shellEnv });
				validateInner(inner); // Refuse remote/custom inners BEFORE evaluator construction.
				resources.add(inner); // Retain ownership even if evaluator construction fails.
				env = new DcgExecutionEnv(inner, { evaluator: testOnlyCreateEvaluator(evaluatorOptions) });
				resources.delete(inner);
				resources.add(env);
				cached.set(cwd, env);
			}
			return env;
		},
		cleanup(context) {
			if (!closing) {
				closed = true;
				const mandatory =
					context && typeof context.value === "function" ? withoutAbortSignal(context) : BACKGROUND_CONTEXT;
				const owned = [...resources].map((env) => {
					try {
						return env.cleanup(mandatory);
					} catch (error) {
						return Promise.reject(error);
					}
				});
				closing = Promise.allSettled(owned).then((results) => {
					cached.clear();
					resources.clear();
					const errors = results
						.filter((result) => result.status === "rejected")
						.map((result) => result.reason as unknown);
					if (errors.length) throw new AggregateError(errors, "DCG factory cleanup failed.");
				});
			}
			return closing;
		},
	};
}
