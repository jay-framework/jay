// Types
export type { AIAgentAPI, AIInteraction, AIPageState, Coordinate } from './types';

// Main API
export { wrapWithAIAgent, type AIWrappedComponent } from './ai-agent';

// Utilities (for advanced use cases)
export { collectInteractions } from './interaction-collector';
