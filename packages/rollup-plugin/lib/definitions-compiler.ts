import { generateElementDefinitionFile, getJayHtmlImports, parseJayFile } from 'jay-compiler';
import { PluginContext, TransformResult } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    writeDefinitionFile,
} from './helpers';
import { generateRefsComponents, getRefsFilePaths } from './refs-compiler.ts';
import { FilterPattern } from 'vite';
import path from 'node:path';

export function jayDefinitions() {
    const generatedRefPaths: Set<string> = new Set();
    return {
        name: 'jayDefinitions', // this name will show up in warnings and errors
        async transform(code: string, id: string): Promise<TransformResult> {
            if (!isJayFile(id)) return { code: '', map: null };

            const context = this as PluginContext;
            checkCodeErrors(code);
            const { filename, dirname } = getFileContext(id);
            const parsedFile = parseJayFile(code, filename, dirname);
            const tsCode = generateElementDefinitionFile(parsedFile);
            checkValidationErrors(tsCode.validations);
            writeDefinitionFile(dirname, filename, tsCode.val);
            context.info(`Generated ${filename}.jay.html.d.ts`);

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

export function jayHtmlImports(options: { include?: FilterPattern; exclude?: FilterPattern } = {}) {
    const filter = createFilter(options.include, options.exclude);

    return {
        name: 'jayHtmlImports',
        async transform(source, id): Promise<TransformResult> {
            if (!filter(id)) return null;

            const context = this as PluginContext;
            const imports = getJayHtmlImports(source).filter((module) =>
                module.endsWith('jay.html.d'),
            );
            const { dirname } = getFileContext(id);
            // make sure imported files are resolved first
            await Promise.all(
                imports.map((imported) =>
                    context.load({
                        id: path.resolve(dirname, imported.slice(0, -2)),
                        resolveDependencies: true,
                    }),
                ),
            );
            return null;
        },
    };
}
