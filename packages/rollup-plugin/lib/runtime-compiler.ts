import { generateElementFile } from 'jay-compiler';
import * as ts from 'typescript';
import { PluginContext, TransformResult } from 'rollup';
import { resolveTsCompilerOptions } from './resolve-ts-config';
import { JayRollupConfig } from './types';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    writeGeneratedFile,
} from './helpers';
import path from 'node:path';

export function jayRuntime(options: JayRollupConfig = {}) {
    const compilerOptions = resolveTsCompilerOptions(options);
    const projectRoot = path.dirname(options.tsConfigFilePath ?? process.cwd());
    const outputDir = options.outputDir && path.join(projectRoot, options.outputDir);

    return {
        name: 'jayRuntime', // this name will show up in warnings and errors
        transform(code: string, id: string): TransformResult {
            if (isJayFile(id)) {
                const context = this as PluginContext;
                checkCodeErrors(code);
                const { filename, dirname } = getFileContext(id);
                const tsCode = generateElementFile(code, filename, dirname);
                checkValidationErrors(tsCode.validations);
                writeGeneratedFile(context, projectRoot, outputDir, id, tsCode.val);
                const transpiledModule = ts.transpileModule(tsCode.val, {
                    compilerOptions: compilerOptions,
                });

                return { code: transpiledModule.outputText, map: null };
            } else {
                return { code, map: null };
            }
        },
    };
}
