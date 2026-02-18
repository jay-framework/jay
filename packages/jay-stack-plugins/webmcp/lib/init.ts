import { makeJayInit } from '@jay-framework/fullstack-component';
import { setupWebMCP } from './webmcp-bridge';

/**
 * WebMCP plugin init — client-only.
 *
 * Listens for the 'jay:automation-ready' event dispatched by the generated
 * client script after window.__jay.automation is set. This avoids the race
 * condition where a setTimeout(0) could fire during another plugin's async
 * init, before automation is available.
 */
export const init = makeJayInit().withClient(() => {
    const setup = () => {
        const automation = (window as any).__jay?.automation;
        if (automation) {
            const cleanup = setupWebMCP(automation);
            window.addEventListener('beforeunload', cleanup);
        } else {
            console.warn('[WebMCP] window.__jay.automation not available — skipping');
        }
    };

    // Already available (e.g. init ran after automation setup)
    if ((window as any).__jay?.automation) {
        setup();
    } else {
        window.addEventListener('jay:automation-ready', setup, { once: true });
    }
});
