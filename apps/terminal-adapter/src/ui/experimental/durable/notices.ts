import { Container, MouseRegion, TruncatedText } from "@earendil-works/pi-tui";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { Notice } from "./runtime.ts";

/** Dock feedback is temporary; goal command output belongs in the transcript instead. */
export class NoticePanel extends Container {
	readonly #items = new Map<number, { notice: Notice; timer?: ReturnType<typeof setTimeout> }>();
	readonly #requestRender: () => void;

	constructor(requestRender: () => void) {
		super();
		this.#requestRender = requestRender;
	}

	update(notices: readonly Notice[]): void {
		const ordinary = notices.filter(item => !item.transient);
		const ids = new Set(ordinary.map(item => item.id));
		for (const [id, item] of this.#items) {
			if (ids.has(id)) continue;
			clearTimeout(item.timer);
			this.#items.delete(id);
		}
		for (const notice of ordinary) {
			// Keep dismissed IDs until the source drops them, so updates never resurrect them.
			if (this.#items.has(notice.id)) continue;
			const timer = setTimeout(() => this.#dismiss(notice.id), notice.level === "info" ? 5_000 : 15_000);
			this.#items.set(notice.id, { notice, timer });
		}
		this.#rebuild();
	}

	#dismiss(id: number): void {
		const item = this.#items.get(id);
		if (!item || item.timer === undefined) return;
		clearTimeout(item.timer);
		item.timer = undefined;
		this.#rebuild();
		this.#requestRender();
	}

	#rebuild(): void {
		this.clear();
		for (const { notice } of [...this.#items.values()].filter(item => item.timer !== undefined).slice(-4)) {
			const row = {
				render: (width: number) => {
					const color = notice.level === "error" ? "error" : notice.level === "warning" ? "warning" : "muted";
					if (width <= 0) return [];
					return new TruncatedText(theme.fg(color, `× ${notice.message}`), width >= 3 ? 1 : 0, 0).render(width);
				},
				invalidate() {},
			};
			this.addChild(new MouseRegion(row, event => {
				if (event.type !== "click" || event.button !== "left") return undefined;
				this.#dismiss(notice.id);
				return { handled: true, render: true };
			}));
		}
	}

	dispose(): void {
		for (const item of this.#items.values()) clearTimeout(item.timer);
		this.#items.clear();
		this.clear();
	}
}
