import { makeJayInit } from '@jay-framework/fullstack-component';
import { setupWebMCP } from './webmcp-bridge';

/**
 * WebMCP plugin init — client-only.
 *
 * Uses queueMicrotask to defer setup until after:
 * 1. All plugin client inits complete
 * 2. Page component is created and mounted
 * 3. wrapWithAutomation() is called
 * 4. window.__jay.automation is set
 *
 * At microtask time, automation is ready.
 */
export const init = makeJayInit().withClient(() => {
    queueMicrotask(() => {
        const automation = (window as any).__jay?.automation;
        if (automation) {
            const cleanup = setupWebMCP(automation);
            window.addEventListener('beforeunload', cleanup);
        }
    });
});
