import { generateElementDefinitionFile, parseJayFile } from 'jay-compiler';
import { PluginContext, TransformResult } from 'rollup';
import { JayRollupConfig } from './types';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    writeDefinitionFile,
} from './helpers';
import { generateRefsComponents, getRefsFilePaths } from './refs-compiler.ts';

export function jayDefinitions(options: JayRollupConfig = {}) {
    const generatedRefPaths: Set<string> = new Set();
    return {
        name: 'jayDefinitions', // this name will show up in warnings and errors
        async transform(code: string, id: string): Promise<TransformResult> {
            if (isJayFile(id)) {
                const context = this as PluginContext;
                checkCodeErrors(code);
                const { filename, dirname } = getFileContext(id);
                const parsedFile = parseJayFile(code, filename, dirname);
                const tsCode = generateElementDefinitionFile(parsedFile);
                if (
                    tsCode.validations.length > 0 &&
                    tsCode.validations[0].includes('File not found')
                ) {
                    context.addWatchFile(id);
                    return { code: '', map: null };
                }
                checkValidationErrors(tsCode.validations);
                writeDefinitionFile(dirname, filename, tsCode.val);

                const newRefsPaths = getRefsFilePaths(
                    generatedRefPaths,
                    dirname,
                    parsedFile.val.imports,
                );
                newRefsPaths.forEach((path) => generatedRefPaths.add(path));
                await generateRefsComponents(newRefsPaths);

                return { code: '', map: null };
            } else {
                return { code, map: null };
            }
        },
    };
}
