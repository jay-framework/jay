import { JayRollupConfig } from '@jay-framework/rollup-plugin';

export interface DevServerOptions {
    serverBase?: string;
    pagesBase?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
}
