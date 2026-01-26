export * from './composite-component';
export * from './composite-part';
export * from './action-caller';

// Re-export automation API for dev tooling and plugins
export {
    wrapWithAutomation,
    AUTOMATION_CONTEXT,
    type AutomationAPI,
    type AutomationWrappedComponent,
    type Interaction,
    type PageState,
    type Coordinate,
} from '@jay-framework/runtime-automation';
