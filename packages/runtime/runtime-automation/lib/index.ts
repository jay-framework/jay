// Types (new names)
export type { AutomationAPI, Interaction, PageState, Coordinate } from './types';

// Types (deprecated aliases for backward compatibility)
export type { AIAgentAPI, AIInteraction, AIPageState } from './types';

// Main API (new names)
export { wrapWithAutomation, type AutomationWrappedComponent } from './automation-agent';

// Context for plugin/component access
export { AUTOMATION_CONTEXT } from './automation-context';

// Utilities (for advanced use cases)
export { collectInteractions } from './interaction-collector';
