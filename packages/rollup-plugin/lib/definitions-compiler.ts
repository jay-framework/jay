import { generateElementDefinitionFile, getJayHtmlImports, parseJayFile } from 'jay-compiler';
import { LoadResult, PluginContext } from 'rollup';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    writeDefinitionFile,
} from './helpers';
import { generateRefsComponents, getRefsFilePaths } from './refs-compiler';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolve } from 'path';

export function jayDefinitions() {
    const generatedRefPaths: Set<string> = new Set();
    return {
        name: 'jay:definitions', // this name will show up in warnings and errors
        async load(id: string): Promise<LoadResult> {
            if (!isJayFile(id)) return null;

            const context = this as PluginContext;
            const code = (await readFile(id)).toString();
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

            checkCodeErrors(code);
            const parsedFile = parseJayFile(code, filename, dirname);
            const tsCode = generateElementDefinitionFile(parsedFile);
            checkValidationErrors(tsCode.validations);
            const generatedFilename = await writeDefinitionFile(dirname, filename, tsCode.val);
            context.info(`[load] generated ${generatedFilename}`);

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
