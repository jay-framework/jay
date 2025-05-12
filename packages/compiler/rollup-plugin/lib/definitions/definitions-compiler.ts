import { generateElementDefinitionFile } from 'jay-compiler';
import { LoadResult, PluginContext, TransformResult } from 'rollup';
import { getFileContext, readFileAsString, writeDefinitionFile } from '../common/files';
import path from 'node:path';
import {
    JAY_EXTENSION,
    hasExtension,
    checkValidationErrors,
    JAY_CONTRACT_EXTENSION,
    JAY_DTS_EXTENSION,
    JAY_CONTRACT_DTS_EXTENSION,
} from 'jay-compiler-shared';
import {
    parseJayFile,
    getJayHtmlImports,
    JAY_IMPORT_RESOLVER,
    parseContract,
    compileContract,
} from 'jay-compiler-jay-html';
import { checkCodeErrors } from '../common/errors';

export function jayDefinitions() {
    return {
        name: 'jay:definitions', // this name will show up in warnings and errors
        async load(id: string): Promise<LoadResult> {
            if (hasExtension(id, JAY_EXTENSION) || hasExtension(id, JAY_CONTRACT_EXTENSION)) {
                const code = await readFileAsString(id);
                checkCodeErrors(code);
                return { code };
            }
            return null;
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (hasExtension(id, JAY_EXTENSION)) {
                const context = this as PluginContext;
                const { filename, dirname } = getFileContext(id);
                // make sure imported files are resolved first
                const imports = getJayHtmlImports(code).filter((module) =>
                    module.endsWith('jay-html.d'),
                );
                await Promise.all(
                    imports.map((imported) =>
                        context.load({
                            id: path.resolve(dirname, imported.slice(0, -2)),
                            resolveDependencies: true,
                        }),
                    ),
                );
                const parsedFile = await parseJayFile(
                    code,
                    filename,
                    dirname,
                    {},
                    JAY_IMPORT_RESOLVER,
                );
                const tsCode = checkValidationErrors(generateElementDefinitionFile(parsedFile));
                const generatedFilename = await writeDefinitionFile(
                    dirname,
                    filename,
                    tsCode,
                    JAY_DTS_EXTENSION,
                );
                context.info(`[transform] generated ${generatedFilename}`);

                return { code: '', map: null };
            } else if (hasExtension(id, JAY_CONTRACT_EXTENSION)) {
                const context = this as PluginContext;
                const { filename, dirname } = getFileContext(id, JAY_CONTRACT_EXTENSION);

                const parsedFile = parseContract(code);
                const tsCode = await compileContract(
                    parsedFile,
                    `${dirname}/${filename}`,
                    JAY_IMPORT_RESOLVER,
                );
                const generatedFilename = await writeDefinitionFile(
                    dirname,
                    filename,
                    tsCode.val,
                    JAY_CONTRACT_DTS_EXTENSION,
                );

                context.info(`[transform] generated ${generatedFilename}`);

                return { code: '', map: null };
            }
            return null;
        },
    };
}
