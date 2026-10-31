import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// UI preferences only; no runtime discovery, installers or provider configuration.
export const getAgentDir = () => process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
export const getCustomThemesDir = () => join(getAgentDir(), "themes");
export const getThemesDir = () => fileURLToPath(new URL("./modes/interactive/theme/", import.meta.url));
