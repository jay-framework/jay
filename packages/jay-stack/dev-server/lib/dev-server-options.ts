import {JayRollupConfig} from "rollup-plugin-jay";

export interface DevServerOptions {
    serverBase?: string;
    pagesBase?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
}