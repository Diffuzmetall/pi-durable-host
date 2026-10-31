/** Authorized Codex Ask, Search, Image and manual quota tools using native host Models. */
import { defineExtension } from "@earendil-works/pi-durable";
import { createAskTool } from "./ask.js";
import { createSearchTool } from "./search.js";
import { createImageTool } from "./image.js";
import { createUsageTool, type Host } from "./runtime.js";

export { makeRuntime, imageMime, inside, usageText, createUsageTool } from "./runtime.js";
export type { CodexRuntime, RuntimeOptions, Host } from "./runtime.js";
export type { CodexAuthorizationRequest, CodexHost } from "./types.js";

export default function createCodexApi(host: Host) {
  return defineExtension({
    name: "codex-api",
    tools: [
      createAskTool(host),
      createSearchTool(host),
      createImageTool(host),
      createUsageTool(host),
    ],
  });
}
