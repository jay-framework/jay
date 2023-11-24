import { generateElementDefinitionFile, parseJayFile } from 'jay-compiler';
import { InputOption, InputOptions, PluginContext, TransformResult } from 'rollup';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    getInputFiles,
    isJayFile,
    writeDefinitionFile,
} from './helpers';
import { generateRefsComponents, getRefsFilePaths } from './refs-compiler.ts';
import path from 'node:path';

export function jayDefinitions() {
    const generatedRefPaths: Set<string> = new Set();
    let inputFiles: Set<string>;
    return {
        name: 'jayDefinitions', // this name will show up in warnings and errors
        buildStart(options: InputOptions): void {
            inputFiles = getInputFiles(options);
        },
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
                context.info(`Generated ${filename}.jay.html.d.ts`);

                const newRefsPaths = getRefsFilePaths(
                    inputFiles,
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
