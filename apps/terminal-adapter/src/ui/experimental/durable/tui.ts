import type { AssistantMessage, ToolResultMessage, UserMessage } from "../../native-types.ts";
import { ROOT_CONVERSATION_ID } from "../../native-types.ts";
import type {
	ConversationId,
	EntryRecord,
	InboxState,
	LiveState,
} from "../../native-types.ts";
import {
	type AutocompleteProvider,
	Box,
	CombinedAutocompleteProvider,
	type Component,
	Container,
	type Focusable,
	fuzzyFilter,
	getKeybindings,
	Input,
	Markdown,
	matchesKey,
	MouseRegion,
	ProcessTerminal,
	ScrollView,
	type SelectItem,
	SelectList,
	type SelectListTheme,
	Spacer,
	setCapabilityOverrides,
	setKeybindings,
	Text,
	TruncatedText,
	truncateToWidth,
	TuiAltScreen,
	visibleWidth,
	VStack,
} from "@earendil-works/pi-tui";
import { getAgentDir } from "../../config.ts";
import { KeybindingsManager } from "../../core/keybindings.ts";
import type { SettingsManager } from "../../core/settings-manager.ts";
import type { Skill } from "../../native-types.ts";
import { NoticePanel } from "./notices.ts";
import { terminalDiagnostics } from "./terminal-diagnostics.ts";
import { toolCardRenderer, toolCardBoundary, resetToolCards } from "../../extensions/tool-cards/renderers.mjs";
import { AssistantMessageComponent } from "../../modes/interactive/components/assistant-message.ts";
import { CustomEditor } from "../../modes/interactive/components/custom-editor.ts";
import { DynamicBorder } from "../../modes/interactive/components/dynamic-border.ts";
import { keyText } from "../../modes/interactive/components/keybinding-hints.ts";
import { type StatusIndicator, WorkingStatusIndicator } from "../../modes/interactive/components/status-indicator.ts";
import { ToolExecutionComponent } from "../../modes/interactive/components/tool-execution.ts";
import { UserMessageComponent } from "../../modes/interactive/components/user-message.ts";
import { getEditorTheme, getMarkdownTheme, initTheme, theme } from "../../modes/interactive/theme/theme.ts";
import { InteractiveThemeController } from "../../modes/interactive/theme/theme-controller.ts";
import { DcgToolCard } from "../dcg-tool-card.ts";
import { agentOf, type DurableController, type DurableView, type DurableViewSource } from "./runtime.ts";
import { activityRowAt, activityStatus, clean, renderActivity } from "../../extensions/activity-panel/activity.ts";
import { renderMailLabel } from "../../extensions/activity-panel/mail-badge.ts";
import { formatGoalResult, goalOperatorInput, renderNativeGoalRow, visibleNativeGoal } from "../../extensions/automation-footer/goal-view.ts";
import { goalEntryText } from "../../extensions/automation-footer/goal-result.ts";
import { readTitle } from "../../extensions/session-resume/title.mjs";

const GOAL_COMMANDS = [
	{ value: "new", description: "Новая цель — агент уточнит недостающее и запустит" },
	{ value: "status", description: "Состояние цели, критерии и расход лимитов" },
	{ value: "list", description: "Все сохранённые цели, включая завершённые" },
	{ value: "stop", description: "Приостановить цель, сохранив прогресс" },
	{ value: "resume", description: "Продолжить сохранённую цель" },
	{ value: "check", description: "Проверить критерии в основном диалоге" },
	{ value: "limits", description: "Посмотреть лимиты; изменение — через явное согласование" },
	{ value: "edit", description: "Изменить согласованную цель или критерии" },
	{ value: "cancel", description: "Отменить окончательно — требуется --confirm" },
	{ value: "approve", description: "Лично принять критерий, требующий проверки человеком" },
	{ value: "help", description: "Краткая справка по управлению целями" },
];

// Only commands implemented by this Durable TUI/controller, not classic Pi's full catalog.
const DURABLE_COMMANDS = [
	{ name: "model", description: "Select model · выбрать модель" },
	{ name: "tasks", description: "Expand/collapse runtime task details · детали задач" },
	{ name: "agents", description: "Switch conversation · Alt+A folds agent panel · агенты" },
	{ name: "terminal", description: "Show terminal capabilities · возможности терминала" },
	{ name: "resume", description: "Resume a saved session · продолжить сессию" },
	{ name: "goal", description: "Goal · цель, гол, критерии и управление",
		getArgumentCompletions: (prefix: string) => /\s/.test(prefix) ? null :
			fuzzyFilter(GOAL_COMMANDS, prefix, item => `${item.value} ${item.description}`)
				.map(item => ({ ...item, label: item.value })),
	},
	{ name: "name", description: "Set persistent session name · название сессии" },
	{ name: "new", description: "Start a new session · новая сессия" },
	{ name: "clear", description: "Start a new session (alias for /new) · очистить" },
	{ name: "quit", description: "Exit Pi Durable · выйти" },
	{ name: "compact", description: "Summarize context · сжать контекст" },
	{ name: "reload", description: "Reload Durable adapters and skill menu · перезагрузить" },
	{ name: "mcp", description: "Show MCP connection status; on/off · подключения" },
];

export function createDurableAutocomplete(cwd: string, skills: readonly Skill[], enableSkills = true): AutocompleteProvider {
	const commands = [
		...DURABLE_COMMANDS,
		...(enableSkills ? skills.map((skill) => ({ name: `skill:${skill.name}`, description: skill.description })) : []),
	];
	const native = new CombinedAutocompleteProvider(commands, cwd);
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const result = await native.getSuggestions(lines, cursorLine, cursorCol, options);
			const prefix = (lines[cursorLine] ?? "").slice(0, cursorCol).trimStart();
			if (options.signal.aborted || options.force || !prefix.startsWith("/")) return result;
			// Once a known command has arguments, leave its text/path completion alone.
			if (/\s/.test(prefix) && commands.some((command) => prefix.startsWith(`/${command.name} `))) return result;
			const names = new Set(result?.items.map((item) => item.value));
			const extra = fuzzyFilter(commands, prefix.slice(1), (command) => `${command.name} ${command.description}`)
				.filter((command) => !names.has(command.name))
				.map((command) => ({ value: command.name, label: command.name, description: command.description }));
			const items = [...(result?.items ?? []), ...extra];
			return items.length ? { items, prefix } : null;
		},
		applyCompletion: native.applyCompletion.bind(native),
		shouldTriggerFileCompletion: native.shouldTriggerFileCompletion.bind(native),
	};
}

const SELECT_THEME: SelectListTheme = {
	selectedPrefix: (text) => theme.fg("accent", text),
	selectedText: (text) => theme.fg("accent", text),
	description: (text) => theme.fg("muted", text),
	scrollInfo: (text) => theme.fg("dim", text),
	noMatch: (text) => theme.fg("warning", text),
};

/** A filterable list in place of the editor. */
class ListSelector extends Container implements Focusable {
	readonly #input = new Input();
	readonly #listContainer = new Container();
	readonly #items: SelectItem[];
	readonly #onSelect: (value: string) => void;
	readonly #onCancel: () => void;
	#list: SelectList;
	#focused = false;

	constructor(title: string, items: SelectItem[], onSelect: (value: string) => void, onCancel: () => void) {
		super();
		this.#items = items;
		this.#onSelect = onSelect;
		this.#onCancel = onCancel;
		this.#list = this.#build(items);
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
		this.addChild(this.#input);
		this.addChild(new Spacer(1));
		this.addChild(this.#listContainer);
		this.addChild(new DynamicBorder());
	}

	get focused(): boolean {
		return this.#focused;
	}
	set focused(value: boolean) {
		this.#focused = value;
		this.#input.focused = value;
	}

	handleInput(data: string): void {
		const keybindings = getKeybindings();
		const forwarded = ["tui.select.up", "tui.select.down", "tui.select.confirm", "tui.select.cancel"] as const;
		if (forwarded.some((action) => keybindings.matches(data, action))) {
			this.#list.handleInput(data);
			return;
		}
		this.#input.handleInput(data);
		const query = this.#input.getValue();
		const filtered =
			query.length === 0 ? this.#items : fuzzyFilter(this.#items, query, (item) => `${item.label} ${item.description ?? ""} ${item.value}`);
		this.#list = this.#build(filtered);
	}

	#build(items: SelectItem[]): SelectList {
		const list = new SelectList(items, 10, SELECT_THEME);
		list.onSelect = (item) => this.#onSelect(item.value);
		list.onCancel = this.#onCancel;
		this.#listContainer.clear();
		this.#listContainer.addChild(list);
		return list;
	}
}

/** The summary that replaced earlier context: collapsed to one line until expanded. */
class CompactionComponent extends Box {
	readonly #summary: string;

	constructor(summary: string, expanded: boolean) {
		super(1, 1, (text) => theme.bg("customMessageBg", text));
		this.#summary = summary;
		this.setExpanded(expanded);
	}

	setExpanded(expanded: boolean): void {
		this.clear();
		this.addChild(new Text(theme.fg("customMessageLabel", theme.bold("[compaction]")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			expanded
				? new Markdown(this.#summary, 0, 0, getMarkdownTheme(), {
						color: (text: string) => theme.fg("customMessageText", text),
					})
				: new Text(
						theme.fg("customMessageText", "Earlier context summarized (") +
							theme.fg("dim", keyText("app.tools.expand")) +
							theme.fg("customMessageText", " to expand)"),
						0,
						0,
					),
		);
	}
}

interface Handlers {
	submit(text: string): void;
	followUp(text: string): void;
	abort(): void;
	openAgent(id: ConversationId): void;
	selectModel(): void;
	cycleThinking(): void;
}

export class DurableTui {
	readonly #ui: TuiAltScreen;
	readonly #chat = new Container();
	readonly #tasks = new Container();
	readonly #queue = new Container();
	readonly #notices = new NoticePanel(() => this.#ui.requestRender());
	readonly #goal = new Container();
	readonly #goalResults = new Container();
	#goalResultId: number | undefined;
	readonly #footer = new Container();
	readonly #identity = new Container();
	readonly #clock: ReturnType<typeof setInterval>;
	#footerView: DurableView | undefined;
	readonly #editorContainer = new Container();
	readonly #editor: CustomEditor;
	readonly #cwd: string;
	/** The newest card per call ID; provider call IDs may repeat across turns. */
	readonly #tools = new Map<string, ToolExecutionComponent>();
	/** Every real body and receipt, including older reused call IDs. */
	readonly #receipts = new Map<ToolExecutionComponent, DcgToolCard>();
	/** Call IDs whose cards the streaming answer created; its entry takes them over. */
	readonly #streamingCalls = new Set<string>();
	readonly #summaries: CompactionComponent[] = [];
	/** Tool output and summaries shown in full; toggled like pi. */
	#expanded = false;
	#agentsCollapsed = false;
	#renderedEntryIds: number[] = [];
	#conversationId: ConversationId | undefined;
	#streaming: AssistantMessageComponent | undefined;
	#indicator: StatusIndicator | undefined;
	#statusText = "";
	/** Set when the transcript was rebuilt: the next render repaints the screen and shows the end. */
	#rebuilt = false;
	#transcript: ScrollView;
	#sessionTitle: string | undefined;

	constructor(cwd: string, sessionDirectory: string, handlers: Handlers) {
		this.#cwd = cwd;
		this.#sessionTitle = readTitle(sessionDirectory);
		this.#ui = new TuiAltScreen(new ProcessTerminal(), false, getAgentDir(), {
			scrollToEndIndicator: () => theme.bg("selectedBg", theme.fg("text", ` ↓ Jump to latest message${keyText("tui.altScreen.bottom") ? ` · ${keyText("tui.altScreen.bottom")}` : ""} `)),
		});
		this.#clock = setInterval(() => this.#ui.requestRender(), 30_000);
		const keybindings = KeybindingsManager.create();
		setKeybindings(keybindings);
		const mailName = () => this.#footerView?.agentMail?.name;
		const sessionName = () => this.#sessionTitle;
		this.#editor = new (class extends CustomEditor {
			protected override renderTopBorder(width: number, hiddenLineCount: number): string {
				const right = renderMailLabel(mailName() || sessionName(), width, theme, truncateToWidth);
				const room = width - visibleWidth(right);
				const name = mailName() && sessionName() && room >= 16
					? truncateToWidth(sessionName()!, room - 12, "…") : "";
				const left = name ? this.borderColor("── ") + theme.fg("accent", name) + this.borderColor(" ") : "";
				return left + super.renderTopBorder(room - visibleWidth(left), hiddenLineCount) + right;
			}
		})(this.#ui, getEditorTheme(), keybindings, {
			paddingX: 1,
			embedWorkingStatus: true,
		});
		const toggleAgents = () => {
			this.#agentsCollapsed = !this.#agentsCollapsed;
			this.#ui.requestRender(true);
		};
		this.#editor.onExtensionShortcut = (data) => {
			if (!matchesKey(data, "alt+a")) return false;
			toggleAgents();
			return true;
		};
		const tasks = new MouseRegion(this.#tasks, (event) => {
			if (event.type !== "click" || event.button !== "left") return undefined;
			if (event.y === 0) toggleAgents();
			else {
				const snapshot = this.#footerView;
				const id = snapshot && activityRowAt({ ...snapshot, agentsCollapsed: this.#agentsCollapsed }, event.y);
				if (id === undefined) return undefined;
				handlers.openAgent(id);
			}
			return { handled: true, render: true };
		});
		this.#editor.onSubmit = handlers.submit;
		this.#editor.onEscape = handlers.abort;
		this.#editor.onAction("app.clear", () => this.#editor.setText(""));
		this.#editor.onAction("app.model.select", handlers.selectModel);
		this.#editor.onAction("app.thinking.cycle", handlers.cycleThinking);
		this.#editor.onAction("app.tools.expand", () => {
			this.#expanded = !this.#expanded;
			for (const component of [...this.#receipts.keys(), ...this.#summaries]) component.setExpanded(this.#expanded);
			this.#ui.requestRender();
		});
		this.#editor.onAction("app.message.followUp", () => {
			const text = this.#editor.getText().trim();
			if (!text) return;
			this.#editor.setText("");
			handlers.followUp(text);
		});

		this.#editorContainer.addChild(this.#editor);
		this.#identity.addChild({ render: (width) => renderChildBanner(this.#footerView, width), invalidate() {} });
		this.#footer.addChild({ render: (width) => this.#renderFooter(width), invalidate() {} });
		// One empty line between the transcript and everything below it.
		const content = new Container();
		content.addChild(this.#chat);
		content.addChild(this.#goalResults);
		content.addChild(new Spacer(1));
		const transcript = new ScrollView(content, { follow: "end", primary: true, overscroll: "chain" });
		this.#transcript = transcript;
		const dock = new VStack([
			{ component: tasks, shrink: 1, minSize: 0 },
			{ component: this.#queue, shrink: 1, minSize: 0 },
			{ component: this.#notices, shrink: 1, minSize: 0 },
			{ component: this.#goal, shrink: 1, minSize: 0 },
			{ component: this.#identity, shrink: 1, minSize: 0 },
			{ component: this.#editorContainer, shrink: 1, minSize: 3 },
			{ component: this.#footer, shrink: 1, minSize: 0 },
		]);
		for (const component of [
			this.#chat,
			this.#goalResults,
			tasks,
			this.#queue,
			this.#notices,
			this.#goal,
			this.#identity,
			this.#editorContainer,
			this.#footer,
		]) {
			this.#ui.addChild(component);
		}
		this.#ui.setLayoutRoot(
			new VStack([
				{ component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
				{ component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
			]),
		);
		this.#ui.setFocus(this.#editor);
	}

	get ui(): TuiAltScreen {
		return this.#ui;
	}

	setSessionTitle(title: string): void {
		this.#sessionTitle = title;
		this.#ui.requestRender();
	}

	start(): void {
		this.#ui.start();
	}

	stop(): void {
		clearInterval(this.#clock);
		this.#notices.dispose();
		this.#discardTools();
		this.#indicator?.dispose();
		this.#ui.stop();
	}

	/** Finish every card: a running bash card keeps a timer until it gets a final result. */
	#discardTools(): void {
		for (const component of this.#receipts.keys()) component.updateResult({ content: [], isError: false }, false);
		resetToolCards();
		this.#tools.clear();
		this.#receipts.clear();
		this.#streamingCalls.clear();
	}

	mount(component: Component): void {
		this.#editorContainer.clear();
		this.#editorContainer.addChild(component);
		this.#ui.setFocus(component);
		this.#ui.requestRender();
	}

	restoreEditor(): void {
		this.mount(this.#editor);
	}

	setAutocomplete(provider: AutocompleteProvider, maxVisible: number): void {
		this.#editor.setAutocompleteMaxVisible(maxVisible);
		this.#editor.setAutocompleteProvider(provider);
	}

	showInputError(text: string, error: unknown): void {
		this.#editor.setText(text);
		this.mount(new ListSelector(`Cannot submit: ${String(error)} (Esc to return)`, [],
			() => this.restoreEditor(), () => this.restoreEditor()));
	}

	apply(view: DurableView): void {
		const live = (view.conversation.docs["pi.live"] ?? {}) as LiveState;
		const conversationId = view.conversation.conversation.id;
		if (this.#conversationId !== undefined && this.#conversationId !== conversationId) {
			this.#rebuild(view.conversation.entries);
		}
		this.#conversationId = conversationId;
		this.#syncTranscript(view.conversation.entries);
		const message = live.generation?.message as AssistantMessage | undefined;
		// A partial without its entry was dropped, for example by a retry: render the transcript again.
		if (message === undefined && this.#streaming !== undefined) this.#rebuild(view.conversation.entries);
		if (message !== undefined) this.#syncStreaming(message);
		for (const slot of live.tools ?? []) {
			if (slot.status === "pending") continue;
			const component = this.#tool(slot.name, slot.callId);
			component.setArgsComplete();
			if (slot.status !== "running") continue;
			component.markExecutionStarted();
			const child = (slot.details as { conversationId?: number } | undefined)?.conversationId;
			if (slot.output === undefined && child !== undefined) {
				const text = `Subagent ${child} is working. /agents switches to it.`;
				component.updateResult({ content: [{ type: "text", text }], details: slot.details, isError: false }, true);
			} else if (slot.output !== undefined) {
				component.updateResult(
					{ content: [{ type: "text", text: slot.output }], details: slot.details, isError: false },
					true,
				);
			}
		}
		this.#syncTasks(view);
		this.#syncQueue((view.conversation.docs["pi.inbox"] ?? { items: [] }) as InboxState);
		if (view.attention?.unavailable) this.#queue.addChild(new TruncatedText(theme.fg("warning", "Attention state unavailable; no answer was sent."), 1, 0));
		for (const request of view.attention?.requests ?? []) {
			this.#queue.addChild(new TruncatedText(theme.fg("warning", `Attention · ${clean(request.name)} · ${clean(request.message)} · replyTo=${clean(request.id)}`), 1, 0));
		}
		this.#syncNotices(view);
		this.#goal.clear();
		if (view.automation.unavailable) this.#goal.addChild(new TruncatedText(theme.fg("warning", "Native automation state unavailable; no state was inferred."), 1, 0));
		const goal = visibleNativeGoal(view.automation.nativeGoals);
		this.#goal.addChild({
			render: width => renderNativeGoalRow(view.automation.nativeGoals, width).map(line =>
				theme.fg(goal?.status === "completed" ? "success" : goal?.status === "paused" || goal?.status === "waiting" ? "warning" : "accent", line)),
			invalidate() {},
		});
		this.#editor.borderColor = view.conversation.conversation.id === ROOT_CONVERSATION_ID
			? theme.getThinkingBorderColor(agentOf(view.conversation).thinkingLevel ?? "off")
			: (text) => theme.fg("warning", text);
		this.#syncStatus(live);
		this.#syncFooter(view);
		if (this.#rebuilt) this.#transcript.scrollToEnd();
		this.#ui.requestRender(this.#rebuilt);
		this.#rebuilt = false;
	}

	#syncTasks(view: DurableView): void {
		this.#tasks.clear();
		// Render theme and width at paint time; no cached ANSI strings after a theme/resize change.
		this.#tasks.addChild({
			render: (width) => renderActivity({ ...view, agentsCollapsed: this.#agentsCollapsed }, width, theme, truncateToWidth),
			invalidate() {},
		});
	}

	#syncQueue(inbox: InboxState): void {
		this.#queue.clear();
		for (const item of inbox.items) {
			const text =
				item.mode === "write" ? `<${String(item.entry.kind)}>` : userText(item.content as UserMessage["content"]);
			this.#queue.addChild(new TruncatedText(theme.fg("muted", `[${item.mode}] ${text}`), 1, 0));
		}
	}

	#syncNotices(view: DurableView): void {
		this.#notices.update(view.notices);
		this.#goalResults.clear();
		for (const item of view.notices.filter(item => item.transient).slice(-4)) {
			this.#goalResults.addChild(new Markdown(formatGoalResult(item.message), 1, 0, getMarkdownTheme()));
		}
		const latest = view.notices.findLast(item => item.transient)?.id;
		if (latest !== this.#goalResultId) {
			this.#goalResultId = latest;
			if (latest !== undefined) this.#transcript.scrollToEnd();
		}
	}

	#syncStatus(live: LiveState): void {
		const generation = live.generation;
		const compaction = live.compactions?.[0];
		const runningTool = live.tools?.find((slot) => slot.status === "running");
		let text = "";
		if (generation?.retry !== undefined) {
			text = `Retrying (attempt ${generation.attempt + 1}): ${generation.retry.error}`;
		} else if (generation?.deferred !== undefined) text = "Waiting for deferred response...";
		else if (compaction !== undefined) {
			text = compaction.retry
				? `Retrying ${compaction.reason} compaction (attempt ${compaction.attempt + 1})...`
				: `Compacting (${compaction.reason})...`;
		} else if (runningTool !== undefined) text = `Running ${runningTool.name}...`;
		else if (live.run !== undefined) text = "Working...";
		if (text === this.#statusText) return;
		this.#statusText = text;
		this.#indicator?.dispose();
		this.#indicator = text
			? new WorkingStatusIndicator(this.#ui, text, undefined, (part) => this.#editor.borderColor(part))
			: undefined;
		this.#editor.setWorkingStatusIndicator(this.#indicator);
	}

	#syncFooter(view: DurableView): void {
		this.#footerView = view;
	}

	#renderFooter(width: number): string[] {
		const view = this.#footerView;
		if (!view || width <= 0) return [];
		const agent = agentOf(view.conversation);
		const modelId = agent.model?.modelId ?? "no-model";
		const model = theme.fg("muted", modelId.replace(/^gpt-/, "gpt "));
		const thinkingLevel = agent.thinkingLevel ?? "off";
		const thinking = theme.getThinkingBorderColor(thinkingLevel)(thinkingLevel);
		const projectPath = view.session.cwd;
		const directory = theme.fg("dim", projectPath.split("/").filter(Boolean).at(-1) ?? projectPath);
		// A client-side Git checkout is not evidence about the remote workspace.
		const branch = theme.fg("muted", "git unknown");
		const contextWindow = view.models.find((candidate) => candidate.provider === agent.model?.provider && candidate.modelId === agent.model.modelId)?.contextWindow ?? 0;
		const tokens = contextTokens(view.conversation.entries);
		const percent = contextWindow > 0 && tokens !== undefined ? (tokens / contextWindow) * 100 : undefined;
		const contextText = percent === undefined ? "?" : `${percent.toFixed(0)}%`;
		const context = theme.fg(percent === undefined ? "dim" : percent >= 90 ? "error" : percent >= 70 ? "warning" : "success", `ctx ${contextText}`);
		const { scheduled, failed, goal } = view.automation;
		const schedule = scheduled || failed
			? theme.fg(failed ? "warning" : "muted", `sched ${scheduled}${failed ? `!${failed}` : ""}`)
			: undefined;
		const goalBadge = goal && goal.status !== "cancelled"
			? theme.fg(goal.status === "met" ? "success" : goal.status === "working" ? "muted" : "warning",
				goal.status === "working" ? `goal ${goal.attempts}/${goal.maxAttempts}` : `goal ${goal.status}`)
			: undefined;
		const network = view.connection === "online" ? undefined : theme.fg("warning", `${view.connection} · stale projection`);
		const badges = [network, schedule, goalBadge].filter((badge): badge is string => badge !== undefined);
		const sep = theme.fg("dim", " · ");
		const join = (parts: string[]) => parts.join(sep);
		const candidates = [
			join([model, thinking, directory, branch, ...badges, context]),
			join([model, thinking, directory, ...badges, context]),
			join([directory, ...badges, context]),
			...(goalBadge && schedule ? [join([directory, goalBadge, context]), join([directory, schedule, context])] : []),
			join([model, thinking, directory, branch, context]),
			join([model, thinking, directory, context]),
			join([directory, context]),
		];
		const room = width - visibleWidth(sep) - visibleWidth(context);
		const line = candidates.find((candidate) => visibleWidth(candidate) <= width)
			?? (room > 0 ? join([truncateToWidth(directory, room, "…"), context]) : truncateToWidth(context, width, ""));
		const live = (view.conversation.docs["pi.live"] ?? {}) as LiveState;
		const lines = [line];
		if (live.tools?.some((slot) => slot.status === "running")) return lines;
		const latest = [...view.conversation.entries].reverse().find((entry) => entry.kind === "pi.assistant" && entry.model?.[0]?.role === "assistant" && entry.model[0].stopReason !== "toolUse");
		const message = latest?.model?.[0];
		if (live.run || live.generation || message?.role !== "assistant" || message.durationMs === undefined || message.timestamp === undefined) return lines;
		const endedAt = message.timestamp + (message.durationMs ?? 0);
		const minutes = Math.floor(Math.max(0, Date.now() - endedAt) / 60_000);
		const elapsed = minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
		const clock = new Date(endedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
		lines.push(truncateToWidth(theme.fg("dim", "ended ") + theme.fg("accent", clock) + sep + theme.fg("muted", elapsed), width, ""));
		return lines;
	}

	#syncTranscript(entries: readonly EntryRecord[]): void {
		// Compaction and resets replace the head of the active transcript.
		if (this.#renderedEntryIds.some((id, index) => entries[index]?.id !== id)) this.#rebuild(entries);
		for (const entry of entries.slice(this.#renderedEntryIds.length)) {
			this.#addEntry(entry);
			this.#renderedEntryIds.push(entry.id);
		}
	}

	#rebuild(entries: readonly EntryRecord[]): void {
		this.#ui.resetTextSelection();
		this.#chat.clear();
		this.#discardTools();
		this.#summaries.length = 0;
		this.#rebuilt = true;
		this.#renderedEntryIds = [];
		this.#streaming = undefined;
		for (const entry of entries) {
			this.#addEntry(entry);
			this.#renderedEntryIds.push(entry.id);
		}
	}

	#addEntry(entry: EntryRecord): void {
		const message = entry.model?.[0];
		const goalResult = goalEntryText(entry);
		if (goalResult !== undefined) {
			toolCardBoundary();
			this.#chat.addChild(new Spacer(1));
			this.#chat.addChild(new Markdown(goalResult, 1, 0, getMarkdownTheme()));
		} else if (entry.kind === "pi.user" && message?.role === "user") {
			toolCardBoundary();
			this.#chat.addChild(new Spacer(1));
			this.#chat.addChild(new UserMessageComponent(userText(message.content)));
		} else if (entry.kind === "pi.assistant" && message?.role === "assistant") {
			const component = this.#streaming ?? new AssistantMessageComponent();
			if (this.#streaming === undefined) this.#chat.addChild(component);
			this.#streaming = undefined;
			component.updateContent(message, false);
			// Only a tool-calling answer runs its calls; an aborted, failed, or truncated one never does.
			const ran = message.stopReason === "toolUse";
			for (const content of message.content) {
				if (content.type !== "toolCall") continue;
				const streamed = this.#streamingCalls.has(content.id);
				// Only cards the stream already showed are kept for calls that never run.
				if (!ran && !streamed) continue;
				const card = this.#tool(content.name, content.id, content.arguments, !streamed);
				card.setArgsComplete();
				if (!ran) {
					const text = "Not run: the answer was interrupted.";
					card.updateResult({ content: [{ type: "text", text }], isError: true }, false);
				}
			}
			this.#streamingCalls.clear();
		} else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
			const result = message as ToolResultMessage;
			const body = this.#tool(result.toolName, result.toolCallId);
			body.updateResult(result);
			this.#receipts.get(body)!.committed(result, entry.data);
		} else if (entry.kind === "pi.compaction") {
			const summary = new CompactionComponent(
				message?.role === "user" ? userText(message.content) : "",
				this.#expanded,
			);
			this.#summaries.push(summary);
			this.#chat.addChild(new Spacer(1));
			this.#chat.addChild(summary);
		} else if (entry.kind === "pi.reset") this.#addText("[new context]");
		else if (entry.kind !== "pi.system") {
			const data = entry.data;
			const text = data && typeof data === "object" && "text" in data && typeof data.text === "string" ? data.text : entry.kind;
			this.#addText(clean(text).slice(0, 4000));
		}
	}

	#syncStreaming(message: AssistantMessage): void {
		if (this.#streaming === undefined) {
			this.#streaming = new AssistantMessageComponent();
			this.#chat.addChild(this.#streaming);
		}
		this.#streaming.updateContent(message, true);
		for (const content of message.content) {
			if (content.type !== "toolCall") continue;
			this.#tool(content.name, content.id, content.arguments, !this.#streamingCalls.has(content.id));
			this.#streamingCalls.add(content.id);
		}
	}

	#addText(text: string): void {
		this.#chat.addChild(new Spacer(1));
		this.#chat.addChild(new Text(theme.fg("muted", text), 1, 0));
	}

	/** The card of a call; `fresh` starts a new one for a call ID an earlier turn used. */
	#tool(name: string, callId: string, args?: unknown, fresh = false): ToolExecutionComponent {
		const existing = fresh ? undefined : this.#tools.get(callId);
		if (existing !== undefined) {
			if (args !== undefined) existing.updateArgs(args);
			return existing;
		}
		const component = new ToolExecutionComponent(
			name,
			callId,
			args ?? {},
			{},
			toolCardRenderer(name),
			this.#ui,
			this.#cwd,
		);
		component.setExpanded(this.#expanded);
		const card = new DcgToolCard(component);
		this.#receipts.set(component, card);
		this.#chat.addChild(card);
		this.#tools.set(callId, component);
		return component;
	}
}

function userText(content: UserMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

function renderChildBanner(view: DurableView | undefined, width: number): string[] {
	if (!view || width <= 0 || view.conversation.conversation.id === ROOT_CONVERSATION_ID) return [];
	const id = view.conversation.conversation.id;
	const label = clean(view.conversations.find((candidate) => candidate.id === id)?.label ?? `conversation ${id}`);
	const text = ` SUBAGENT · ${label} · /agents → main `;
	return [theme.style(truncateToWidth(text, width, "").padEnd(width), { fg: "warning", bg: "selectedBg", bold: true })];
}

/** Context size from the newest successful answer after the newest compaction; unknown before one. */
function contextTokens(entries: readonly EntryRecord[]): number | undefined {
	// Kept entries follow the summary in the view but are older than it; only later answers measure the new context.
	const compacted = Math.max(0, ...entries.filter((entry) => entry.kind === "pi.compaction").map((entry) => entry.id));
	for (const entry of [...entries].reverse()) {
		const message = entry.model?.[0];
		if (entry.id < compacted || entry.kind !== "pi.assistant" || message?.role !== "assistant") continue;
		if (message.stopReason === "aborted" || message.stopReason === "error") continue;
		const usage = message.usage;
		return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	}
	return undefined;
}

/** Returns null for a new session, a remote session ID to resume, or undefined to detach. */
export async function runDurableTui(
	source: DurableViewSource,
	controller: DurableController,
	settings: SettingsManager,
	startupWarning?: string,
): Promise<string | null | undefined> {
	setCapabilityOverrides(settings.getTerminalCapabilityOverrides());
	// The system theme until the controller resolves the user's theme against the terminal's colors.
	initTheme();
	let exit = (): void => {};
	let selectedSession: string | null | undefined;
	const exited = new Promise<void>((resolve) => {
		exit = resolve;
	});
	let view!: DurableTui;
	let skills: Skill[] = [];
	const refreshAutocomplete = async (): Promise<void> => {
		skills = [...(source.current().skills ?? [])];
		// A server path is never interpreted as a local directory by autocomplete.
		view.setAutocomplete(createDurableAutocomplete(process.cwd(), skills, settings.getEnableSkillCommands()), settings.getAutocompleteMaxVisible());
	};
	const submitInput = (text: string, whenBusy: "steer" | "followUp"): void => {
		// The remote controller resolves the authorized server body and freezes it before POST.
		void controller.submit(goalOperatorInput(text, source.current().automation.nativeGoals), whenBusy)
			.catch((error) => view.showInputError(text, error));
	};

	const selectModel = (): void => {
		const snapshot = source.current();
		const current = agentOf(snapshot.conversation).model;
		const isCurrent = (model: { provider: string; modelId: string }) =>
			model.provider === current?.provider && model.modelId === current.modelId;
		const items: SelectItem[] = [...snapshot.models]
			.sort((left, right) => Number(isCurrent(right)) - Number(isCurrent(left)))
			.map((model) => ({
				value: `${model.provider}/${model.modelId}`,
				label: model.modelId,
				description: model.provider,
			}));
		const selector = new ListSelector(
			"Select model:",
			items,
			(value) => {
				view.restoreEditor();
				const separator = value.indexOf("/");
				void controller.setModel({ provider: value.slice(0, separator), modelId: value.slice(separator + 1) });
			},
			() => view.restoreEditor(),
		);
		view.mount(selector);
	};

	let clickReturnId: ConversationId | undefined;
	const selectConversation = (): void => {
		const snapshot = source.current();
		const items: SelectItem[] = [...snapshot.conversations].reverse().map((candidate) => ({
			value: String(candidate.id),
			label: `${activityStatus(candidate, snapshot.tasks).glyph} ${clean(candidate.label)} · ${clean(activityStatus(candidate, snapshot.tasks).label)}`,
			description: `${candidate.id === snapshot.conversation.conversation.id ? "(shown) " : ""}${clean(candidate.title)}`,
		}));
		const selector = new ListSelector(
			"Switch to:",
			items,
			(value) => {
				view.restoreEditor();
				clickReturnId = undefined;
				void controller.switchConversation(Number(value) as ConversationId);
			},
			() => view.restoreEditor(),
		);
		view.mount(selector);
	};

	const selectSession = async (): Promise<void> => {
		try {
			const rows = await controller.listSessions();
			const items: SelectItem[] = rows.map((row) => ({
				value: row.id,
				label: row.name,
				description: row.cwd,
			}));
			view.mount(new ListSelector(
				items.length ? "Resume session (Esc to cancel):" : "No sessions found (Esc to close)",
				items,
				(id) => {
					if (id === source.current().session.id) return view.restoreEditor();
					selectedSession = id;
					exit();
				},
				() => view.restoreEditor(),
			));
		} catch (error) {
			view.mount(new ListSelector(`Resume unavailable: ${String(error)} (Esc to close)`, [],
				() => view.restoreEditor(), () => view.restoreEditor()));
		}
	};

	view = new DurableTui(process.cwd(), source.current().session.directory, {
		submit: (text) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			if (trimmed === "/model") return selectModel();
			if (trimmed === "/tasks") return void controller.toggleTasks();
			if (trimmed === "/agents") return selectConversation();
			if (trimmed === "/terminal") {
				view.mount(new ListSelector(terminalDiagnostics(settings.getTerminalCapabilityOverrides()), [],
					() => view.restoreEditor(), () => view.restoreEditor()));
				return;
			}
			if (trimmed === "/resume") return void selectSession();
			if (trimmed === "/name" || trimmed.startsWith("/name ")) {
				void controller.renameSession(trimmed.slice(5)).then((name) => view.setSessionTitle(name))
					.catch((error) => view.showInputError(text, error));
				return;
			}
			if (trimmed === "/quit") return exit();
			if (trimmed === "/new" || trimmed === "/clear") {
				selectedSession = null;
				return exit();
			}
			if (trimmed === "/reload" || trimmed.startsWith("/reload ")) {
				return void controller.reload(trimmed.slice("/reload".length).trim() || undefined).then(refreshAutocomplete)
					.catch((error) => view.showInputError(text, error));
			}
			if (trimmed === "/compact" || trimmed.startsWith("/compact ")) {
				const instructions = trimmed.slice("/compact".length).trim();
				return void controller.compact(instructions || undefined);
			}
			submitInput(trimmed, "steer");
		},
		followUp: (text) => submitInput(text, "followUp"),
		abort: () => {
			const current = source.current().conversation.conversation.id;
			if (clickReturnId === undefined && current === ROOT_CONVERSATION_ID) return void controller.abort();
			const previous = clickReturnId ?? ROOT_CONVERSATION_ID;
			clickReturnId = undefined;
			void controller.switchConversation(previous);
		},
		openAgent: (id) => {
			const current = source.current().conversation.conversation.id;
			if (id === current) {
				clickReturnId ??= ROOT_CONVERSATION_ID;
				return;
			}
			clickReturnId ??= current;
			void controller.switchConversation(id);
		},
		selectModel,
		cycleThinking: () => void controller.cycleThinking(),
	});

	await refreshAutocomplete();

	// pi's theme handling: the theme setting (also light/dark pairs) resolved against the terminal's reported colors.
	const themes = new InteractiveThemeController(view.ui, {
		getSettingsManager: () => settings,
		showError: (message) => console.error(message),
		onChanged: () => view.ui.requestRender(),
	});
	const unsubscribe = source.subscribe(() => {
		view.setSessionTitle(source.current().session.name);
		view.apply(source.current());
	});
	view.setSessionTitle(source.current().session.name);
	view.start();
	themes.applyFromSettings();
	view.apply(source.current());
	if (startupWarning) view.mount(new ListSelector(startupWarning, [],
		() => view.restoreEditor(), () => view.restoreEditor()));
	await exited;
	unsubscribe();
	themes.dispose();
	view.stop();
	return selectedSession;
}
