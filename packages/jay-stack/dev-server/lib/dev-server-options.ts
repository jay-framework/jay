import { JayRollupConfig } from '@jay-framework/rollup-plugin';

export interface DevServerOptions {
    publicBaseUrlPath?: string;
    projectRootFolder?: string;
    pagesRootFolder?: string;
    /**
     * Folder where build artifacts are stored.
     * Pre-rendered jay-html files are written to `<buildFolder>/slow-render-cache/`.
     * Defaults to `<projectRootFolder>/build`.
     */
    buildFolder?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
    /**
     * Disable automation integration.
     * When false (default), pages are wrapped with automation API for dev tooling.
     * The automation API is available at `window.__jay.automation` and via `AUTOMATION_CONTEXT`.
     */
    disableAutomation?: boolean;
}
