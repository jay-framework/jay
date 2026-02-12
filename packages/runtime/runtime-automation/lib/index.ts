// Types
export type { AutomationAPI, Interaction, InteractionInstance, PageState, Coordinate } from './types';

// Types (deprecated aliases for backward compatibility)
export type { AIAgentAPI, AIInteraction, AIPageState } from './types';

// Main API
export {
    wrapWithAutomation,
    type AutomationWrappedComponent,
    type AutomationAgentOptions,
} from './automation-agent';

// Context for plugin/component access
export { AUTOMATION_CONTEXT } from './automation-context';

// Utilities (for advanced use cases)
export { collectInteractions } from './interaction-collector';
export { groupInteractions } from './group-interactions';
