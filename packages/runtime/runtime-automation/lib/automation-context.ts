import { createJayContext } from '@jay-framework/runtime';
import type { AutomationAPI } from './types';

/**
 * Global context for accessing the automation API.
 * Available in dev mode when automation is enabled.
 *
 * @example
 * ```typescript
 * import { useContext } from '@jay-framework/runtime';
 * import { AUTOMATION_CONTEXT } from '@jay-framework/runtime-automation';
 *
 * function MyComponent(props, refs, automation: AutomationAPI) {
 *     const state = automation.getPageState();
 *     // ...
 * }
 *
 * export const MyComp = makeJayComponent(render, MyComponent, AUTOMATION_CONTEXT);
 * ```
 */
export const AUTOMATION_CONTEXT = createJayContext<AutomationAPI>();
