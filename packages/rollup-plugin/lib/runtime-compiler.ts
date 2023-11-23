import { generateElementFile } from 'jay-compiler';
import * as ts from 'typescript';
import path from 'path';
import { TransformResult } from 'rollup';
import { resolveTsCompilerOptions } from './resolve-ts-config';
import { JayRollupConfig } from './types';

export function jayRuntime(options: JayRollupConfig = {}) {
    const compilerOptions = resolveTsCompilerOptions(options);
    return {
        name: 'jay', // this name will show up in warnings and errors
        transform(code: string, id: string): TransformResult {
            if (id.endsWith('.jay.html') && !id.startsWith('.jay.html')) {
                if (code.length === 0) throw new Error('Empty code');
                const filename = path.basename(id).replace('.jay.html', '');
                const dirName = path.dirname(id);
                const tsCode = generateElementFile(code, filename, dirName);
                if (tsCode.validations.length > 0) {
                    throw new Error(tsCode.validations.join('\n'));
                }
                let transpiledModule = ts.transpileModule(tsCode.val, {
                    compilerOptions: compilerOptions,
                });
                return { code: transpiledModule.outputText, map: null };
            } else {
                return { code, map: null };
            }
        },
    };
}
