import type { ProgramStatus, Terminal } from "@earendil-works/pi-tui";
import type { LiveState } from "../../native-types.ts";
import type { DurableView } from "./runtime.ts";

/** One root protocol record for the displayed conversation, never transcript/tool text. */
export function durableProgramStatus(view: DurableView): ProgramStatus {
	const message = view.session.name;
	// A disconnected projection is historical, not evidence of completion or current work.
	if (view.connection !== "online") return { state: "idle", app: "pi", message: `Host ${view.connection}` };
	if (view.attention?.requests.length) return { state: "blocked", kind: "question", app: "pi", message: "Agent decision required" };
	const live = (view.conversation.docs["pi.live"] ?? {}) as LiveState;
	if (live.compactions?.length) return { state: "working", app: "pi", message: "Compacting" };
	if (live.run || live.generation || live.tools?.some(slot => slot.status !== "done")) {
		return { state: "working", app: "pi", message };
	}
	// Do not reuse an old successful/error answer after a newer input or context reset.
	for (const entry of [...view.conversation.entries].reverse()) {
		if (entry.kind === "pi.reset" || entry.kind === "pi.user" || entry.kind === "host.input") break;
		if (entry.kind !== "pi.assistant") continue;
		const message = entry.model?.find(message => message.role === "assistant");
		if (message?.role !== "assistant") break;
		if (message.stopReason === "error") return {
			state: "error", app: "pi", message: message.errorMessage?.split(/\r?\n/)[0] || "Run failed",
		};
		if (message.stopReason === "stop" || message.stopReason === "length") return { state: "done", app: "pi", message: view.session.name };
		// Aborted, tool-call-only, pending and unknown outcomes are not successful completion.
		break;
	}
	return { state: "idle", app: "pi", message };
}

/** The native terminal owns support negotiation, encoding, overrides and clear-on-stop. */
export class DurableProgramStatus {
	#view: DurableView | undefined;
	#dialog: Pick<ProgramStatus, "kind" | "message"> | undefined;
	#last: string | undefined;

	constructor(private readonly terminal: Pick<Terminal, "setProgramStatus">) {}

	update(view: DurableView): void {
		this.#view = view;
		this.#report();
	}

	dialog(message?: string, kind: NonNullable<ProgramStatus["kind"]> = "question"): void {
		this.#dialog = message === undefined ? undefined : { message, kind };
		this.#report();
	}

	#report(): void {
		const status: ProgramStatus = this.#dialog
			? { state: "blocked", app: "pi", ...this.#dialog }
			: this.#view ? durableProgramStatus(this.#view) : { state: "idle", app: "pi" };
		const signature = JSON.stringify(status);
		if (signature === this.#last) return;
		this.#last = signature;
		this.terminal.setProgramStatus(status);
	}
}
