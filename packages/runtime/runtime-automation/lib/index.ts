// Types (new names)
export type { AutomationAPI, Interaction, PageState, Coordinate } from './types';

// Types (deprecated aliases for backward compatibility)
export type { AIAgentAPI, AIInteraction, AIPageState } from './types';

// Main API (new names)
export { wrapWithAutomation, type AutomationWrappedComponent } from './automation-agent';

// Main API (deprecated aliases for backward compatibility)
export { wrapWithAIAgent, type AIWrappedComponent } from './automation-agent';

// Utilities (for advanced use cases)
export { collectInteractions } from './interaction-collector';
