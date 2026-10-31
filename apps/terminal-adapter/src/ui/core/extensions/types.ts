import type { Component } from "@earendil-works/pi-tui";
import type { theme } from "../../modes/interactive/theme/theme.js";

/** Display callbacks only; the client never receives an executable tool definition from the host. */
export interface ToolRenderContext {
  args: unknown; toolCallId: string; invalidate(): void; lastComponent: Component | undefined;
  state: Record<string, unknown>; cwd: string; executionStarted: boolean; argsComplete: boolean;
  isPartial: boolean; expanded: boolean; showImages: boolean; isError: boolean;
}
export interface MarkdownTransformContext {
  messageType: "user" | "assistant" | "assistant-thinking";
  isStreaming: boolean;
  availableWidth: number;
}
export type MarkdownTransformer = (markdown: string, context: MarkdownTransformContext) => string;
export interface ToolRenderers {
  renderShell?: "default" | "self";
  renderCall?: (args: unknown, style: typeof theme, context: ToolRenderContext) => Component;
  renderResult?: (result: { content: readonly { type: string; text?: string; data?: string; mimeType?: string }[]; details?: unknown }, options: { expanded: boolean; isPartial: boolean }, style: typeof theme, context: ToolRenderContext) => Component;
}
