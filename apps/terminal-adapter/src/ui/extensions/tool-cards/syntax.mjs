// Import the existing host's syntax utilities without loading its entire public
// barrel (which also initializes unrelated extension/runtime integrations).
export { highlightCode, getLanguageFromPath } from '../../modes/interactive/theme/theme.ts';
