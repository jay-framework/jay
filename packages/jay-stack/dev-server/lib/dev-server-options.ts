import { JayRollupConfig } from 'jay-rollup-plugin';

export interface DevServerOptions {
    serverBase?: string;
    pagesBase?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
}
