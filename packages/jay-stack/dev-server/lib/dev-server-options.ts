import { JayRollupConfig } from '@jay-framework/rollup-plugin';
import type { LogLevel } from '@jay-framework/logger';
import type { Server } from 'node:http';

export interface DevServerOptions {
    publicBaseUrlPath?: string;
    projectRootFolder?: string;
    pagesRootFolder?: string;
    /**
     * Folder where build artifacts are stored.
     * Pre-rendered jay-html files are written to `<buildFolder>/pre-rendered/`.
     * Defaults to `<projectRootFolder>/build`.
     */
    buildFolder?: string;
    jayRollupConfig: JayRollupConfig;
    /**
     * Disable server-side rendering. When true, pages are served as client-only
     * (element target, no hydration). Useful for development without SSR overhead.
     */
    disableSSR?: boolean;
    /**
     * Disable automation integration.
     * When false (default), pages are wrapped with automation API for dev tooling.
     * The automation API is available at `window.__jay.automation` and via `AUTOMATION_CONTEXT`.
     */
    disableAutomation?: boolean;
    /**
     * Log level for dev server output.
     * Controls both Jay logging and Vite logging.
     */
    logLevel?: LogLevel;
    /** HTTP server for HMR WebSocket attachment (avoids default port 24678 collision) */
    httpServer?: Server;
    /**
     * Hosts the dev server's Vite host-check accepts, beyond localhost (DL#220). A list of hosts
     * (Vite host-suffix syntax, e.g. `.example.dev`), or `true` to disable the check entirely — for
     * cloud preview proxies. Merged with the `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` env var.
     */
    allowedHosts?: string[] | true;
    /**
     * Enable source-editing dev markers (DL#219). When true, the pre-render pipeline injects
     * `jay-dev-src` / `jay-dev-item` attributes so the source-editing inspector can map a rendered
     * pixel back to its jay-html source. Off by default — the markers change rendered output, so
     * they are only emitted for AIditor / source-editing sessions.
     */
    sourceEditing?: boolean;
}
