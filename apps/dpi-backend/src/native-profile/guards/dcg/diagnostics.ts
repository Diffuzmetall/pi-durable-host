import type { DcgDecision } from "./evaluator.js";

export interface DcgDiagnosticOptions {
	cwd?: string;
}

function inert(value: string): string {
	return value
		.toWellFormed()
		.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g, "")
		.replace(/\x1b[P_^][\s\S]*?(?:\x1b\\|$)/g, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/[\u0000-\u001f\u007f-\u009f\p{Cf}]/gu, " ")
		.replace(/[<>[\]]/g, (char) => ({ "<": "＜", ">": "＞", "[": "［", "]": "］" })[char] ?? " ")
		.replace(/\s+/gu, " ")
		.trim();
}

function bounded(value: string, bytes: number): string {
	if (Buffer.byteLength(value) <= bytes) return value;
	let result = "";
	let used = Buffer.byteLength("…");
	for (const char of value) {
		const size = Buffer.byteLength(char);
		if (used + size > bytes) break;
		result += char;
		used += size;
	}
	return `${result}…`;
}

/** Single-line <=8192 UTF-8 bytes. Policy reason is untrusted inert text, not guaranteed secret-free. */
export function formatDcgDiagnostic(decision: DcgDecision, options: DcgDiagnosticOptions = {}): string {
	const denied = decision?.kind === "deny";
	const head = denied ? "DCG_DENIED: shell not executed." : "DCG_UNAVAILABLE: shell not executed.";
	const action = denied
		? " Choose a different command; destructive actions still require applicable user authorization."
		: " Check the trusted DCG binary/configuration; submit a new command after repair.";
	const fields: string[] = [];
	if (denied) {
		for (const [key, value] of [
			["rule", decision.ruleId],
			["pack", decision.packId],
		]) {
			if (typeof value === "string" && inert(value)) fields.push(`${key}=${bounded(inert(value), 512)}`);
		}
	} else if (decision?.kind === "unavailable") {
		fields.push(`category=${bounded(inert(decision.category) || "invalid-decision", 256)}`);
	}
	if (typeof options.cwd === "string") fields.push(`cwd=${bounded(inert(options.cwd), 1024)}`);
	const details = fields.length ? ` ${fields.join(" ")}` : "";
	const reason = decision?.kind !== "allow" && typeof decision?.reason === "string" ? inert(decision.reason) : "";
	const fallback = denied ? "Blocked by DCG policy." : "Guard could not validate this invocation.";
	const budget = 8192 - Buffer.byteLength(`${head}${details} ${action}`);
	return `${head}${details} ${bounded(reason || fallback, budget)}${action}`;
}
