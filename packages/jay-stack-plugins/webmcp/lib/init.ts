import { makeJayInit } from '@jay-framework/fullstack-component';
import { setupWebMCP } from './webmcp-bridge';

/**
 * WebMCP plugin init — client-only.
 *
 * Uses setTimeout(0) to defer setup until after the current task completes:
 * 1. All plugin client inits (each `await`ed, creating microtasks)
 * 2. Page component is created and mounted
 * 3. wrapWithAutomation() is called
 * 4. window.__jay.automation is set
 *
 * Why setTimeout and not queueMicrotask:
 * Plugin inits are `await`ed in the generated script. `await undefined` yields
 * to the microtask queue, so a queueMicrotask callback runs BEFORE the rest of
 * the script (component creation, automation setup). setTimeout(0) schedules on
 * the macrotask queue, which runs after all synchronous code and microtasks.
 */
export const init = makeJayInit().withClient(() => {
    setTimeout(() => {
        const automation = (window as any).__jay?.automation;
        if (automation) {
            const cleanup = setupWebMCP(automation);
            window.addEventListener('beforeunload', cleanup);
        } else {
            console.warn('[WebMCP] window.__jay.automation not available — skipping');
        }
    }, 0);
});
