import { generateElementDefinitionFile } from 'jay-compiler';
import { PluginContext, TransformResult } from 'rollup';
import { resolveTsCompilerOptions } from './resolve-ts-config';
import { JayRollupConfig } from './types';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    writeDefinitionFile,
} from './helpers';

export function jayDefinitions(options: JayRollupConfig = {}) {
    return {
        name: 'jayDefinitions', // this name will show up in warnings and errors
        transform(code: string, id: string): TransformResult {
            if (isJayFile(id)) {
                const context = this as PluginContext;
                checkCodeErrors(code);
                const { filename, dirname } = getFileContext(id);
                const tsCode = generateElementDefinitionFile(code, filename, dirname);
                if (
                    tsCode.validations.length > 0 &&
                    tsCode.validations[0].includes('File not found')
                ) {
                    context.addWatchFile(id);
                    return { code: '', map: null };
                }
                checkValidationErrors(tsCode.validations);
                writeDefinitionFile(dirname, filename, tsCode.val);
                return { code: '', map: null };
            } else {
                return { code, map: null };
            }
        },
    };
}
