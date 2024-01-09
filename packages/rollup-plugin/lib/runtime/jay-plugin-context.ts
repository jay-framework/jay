import * as ts from 'typescript';
import { JayRollupConfig } from '../common/types';
import path from 'node:path';
import { JayFile } from 'jay-compiler';

export class JayPluginContext {
    readonly projectRoot: string;
    readonly outputDir: string;
    readonly tsPrinter: ts.Printer;
    jayFileCache = new Map<string, JayFile>();

    constructor(readonly jayOptions: JayRollupConfig = {}) {
        this.projectRoot = path.dirname(jayOptions.tsConfigFilePath ?? process.cwd());
        this.outputDir = jayOptions.outputDir && path.join(this.projectRoot, jayOptions.outputDir);
        this.tsPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    }

    cacheJayFile(id: string, jayFile: JayFile): JayFile {
        console.info('[cache] set', id);
        this.jayFileCache.set(id, jayFile);
        return jayFile;
    }

    getCachedJayFile(id: string): JayFile {
        const jayFile = this.jayFileCache.get(id);
        if (Boolean(jayFile)) {
            console.info('[cache] hit', id);
        }
        return jayFile;
    }

    deleteCachedJayFile(id: string): boolean {
        return this.jayFileCache.delete(id);
    }
}
