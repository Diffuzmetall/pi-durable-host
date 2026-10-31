import { getCapabilities, type TerminalCapabilities } from "@earendil-works/pi-tui";

/** Only recognized identity labels and override names are displayed; environment values stay private. */
export function terminalDiagnostics(settings: Partial<TerminalCapabilities>, env: NodeJS.ProcessEnv = process.env): string {
	const program = env.TERM_PROGRAM?.toLowerCase();
	const known = ["rex", "herdr", "kitty", "ghostty", "wezterm", "warpterminal", "iterm.app", "alacritty", "vscode", "zed"];
	const identity = program && known.includes(program) ? program : "unknown";
	const term = env.TERM?.toLowerCase() ?? "";
	const multiplexer = env.TMUX || term.startsWith("tmux") ? "tmux" : term.startsWith("screen") ? "screen" : undefined;
	const overrides = [
		...(env.PI_HYPERLINKS === "0" || env.PI_HYPERLINKS === "1" ? ["PI_HYPERLINKS"] : []),
		...(env.PI_TRUE_COLOR === "0" || env.PI_TRUE_COLOR === "1" ? ["PI_TRUE_COLOR"] : []),
		...(["kitty", "iterm2", "none", "0"].includes(env.PI_IMAGE_PROTOCOL?.toLowerCase() ?? "") ? ["PI_IMAGE_PROTOCOL"] : []),
		...Object.keys(settings).filter((key) => ["images", "trueColor", "hyperlinks"].includes(key)).map((key) => `settings.${key}`),
	];
	const caps = getCapabilities();
	return [
		`Terminal: ${identity}${multiplexer ? ` · ${multiplexer}` : ""}`,
		`Hyperlinks: ${caps.hyperlinks ? "on" : "off"} · True color: ${caps.trueColor ? "on" : "off"} · Images: ${caps.images ?? "off"}`,
		`Overrides: ${overrides.join(", ") || "none"} (settings take precedence)`,
		multiplexer ? `${multiplexer}: image forwarding is normally disabled; overrides can change this.` :
			identity === "unknown" ? "Unknown terminal: conservative fallback; check SSH environment forwarding." :
			"Links use the terminal's modifier-click; client support is required.",
		"Esc to close",
	].join("\n");
}
