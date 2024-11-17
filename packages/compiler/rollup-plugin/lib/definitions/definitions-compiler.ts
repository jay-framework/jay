import {
    checkCodeErrors,
    checkValidationErrors,
    generateElementDefinitionFile,
    getJayHtmlImports,
    hasExtension,
    parseJayFile,
} from 'jay-compiler';
import { LoadResult, PluginContext, TransformResult } from 'rollup';
import { getFileContext, readFileAsString, writeDefinitionFile } from '../common/files';
import { generateRefsComponents, getRefsFilePaths } from './refs-compiler';
import path from 'node:path';
import { JAY_EXTENSION } from '../../../compiler/lib/core/constants';

export function jayDefinitions() {
    const generatedRefPaths: Set<string> = new Set();
    return {
        name: 'jay:definitions', // this name will show up in warnings and errors
        async load(id: string): Promise<LoadResult> {
            if (!hasExtension(id, JAY_EXTENSION)) return null;

            const code = await readFileAsString(id);
            checkCodeErrors(code);
            return { code };
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (!hasExtension(id, JAY_EXTENSION)) return null;

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
            const parsedFile = parseJayFile(code, filename, dirname, {});
            const tsCode = checkValidationErrors(generateElementDefinitionFile(parsedFile));
            const generatedFilename = await writeDefinitionFile(dirname, filename, tsCode);
            context.info(`[transform] generated ${generatedFilename}`);

            const newRefsPaths = getRefsFilePaths(
                generatedRefPaths,
                dirname,
                parsedFile.val.imports,
            );
            newRefsPaths.forEach((path) => generatedRefPaths.add(path));
            await generateRefsComponents(newRefsPaths);

            return { code: '', map: null };
        },
    };
}
