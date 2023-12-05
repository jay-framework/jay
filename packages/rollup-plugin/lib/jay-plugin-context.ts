import * as ts from 'typescript';
import { JayRollupConfig } from './types';
import path from 'node:path';

export class JayPluginContext {
    readonly projectRoot: string;
    readonly outputDir: string;
    readonly isWorker: boolean;
    readonly tsPrinter: ts.Printer;

    constructor(readonly jayOptions: JayRollupConfig = {}) {
        this.projectRoot = path.dirname(jayOptions.tsConfigFilePath ?? process.cwd());
        this.outputDir = jayOptions.outputDir && path.join(this.projectRoot, jayOptions.outputDir);
        this.isWorker = Boolean(jayOptions.isWorker);
        this.tsPrinter = ts.createPrinter({
            newLine: ts.NewLineKind.LineFeed,
        });
    }
}
