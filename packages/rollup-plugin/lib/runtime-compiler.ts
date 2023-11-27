import { generateElementFile } from 'jay-compiler';
import * as ts from 'typescript';
import { TransformResult } from 'rollup';
import { resolveTsCompilerOptions } from './resolve-ts-config';
import { JayRollupConfig } from './types';
import { checkCodeErrors, checkValidationErrors, getFileContext, isJayFile } from './helpers';

export function jayRuntime(options: JayRollupConfig = {}) {
    const compilerOptions = resolveTsCompilerOptions(options);
    return {
        name: 'jayRuntime', // this name will show up in warnings and errors
        transform(code: string, id: string): TransformResult {
            if (isJayFile(id)) {
                checkCodeErrors(code);
                const { filename, dirname } = getFileContext(id);
                const tsCode = generateElementFile(code, filename, dirname);
                checkValidationErrors(tsCode.validations);
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
