import type { setCapabilityOverrides } from "@earendil-works/pi-tui";

/** The presentation settings actually consumed by the selected renderer. No model/auth settings. */
export interface SettingsManager {
  getTerminalCapabilityOverrides(): Parameters<typeof setCapabilityOverrides>[0];
  getEnableSkillCommands(): boolean;
  getAutocompleteMaxVisible(): number;
  getThemeSetting(): string | undefined;
}
