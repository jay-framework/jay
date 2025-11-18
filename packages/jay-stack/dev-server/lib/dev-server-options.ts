import { JayRollupConfig } from '@jay-framework/rollup-plugin';

export interface DevServerOptions {
    publicBaseUrlPath?: string;
    projectRootFolder?: string;
    pagesRootFolder?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
}
