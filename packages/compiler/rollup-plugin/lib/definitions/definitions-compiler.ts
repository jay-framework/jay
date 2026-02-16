import { generateElementDefinitionFile } from '@jay-framework/compiler';
import { LoadResult, PluginContext, TransformResult } from 'rollup';
import { getFileContext, readFileAsString, writeDefinitionFile } from '../common/files';
import path from 'node:path';
import fs from 'node:fs';
import {
    JAY_EXTENSION,
    hasExtension,
    checkValidationErrors,
    JAY_CONTRACT_EXTENSION,
    JAY_ACTION_EXTENSION,
    JAY_DTS_EXTENSION,
    JAY_CONTRACT_DTS_EXTENSION,
    JAY_ACTION_DTS_EXTENSION,
} from '@jay-framework/compiler-shared';
import {
    parseJayFile,
    getJayHtmlImports,
    JAY_IMPORT_RESOLVER,
    parseContract,
    compileContract,
    parseAction,
    compileAction,
    defaultContractResolver,
    type JayImportResolver,
    type ContractResolver,
} from '@jay-framework/compiler-jay-html';
import { checkCodeErrors } from '../common/errors';

/**
 * Creates a ContractResolver for action compilation using the import resolver.
 * Uses the same resolveLink mechanism as contract link resolution
 * (see linked-contract-resolver.ts), with support for both relative
 * paths and npm packages.
 */
function createContractResolver(
    baseDir: string,
    importResolver: JayImportResolver,
): ContractResolver {
    return (contractSubpath: string) => {
        const { viewStateName } = defaultContractResolver(contractSubpath);
        const subpathWithExt = contractSubpath.endsWith(JAY_CONTRACT_EXTENSION)
            ? contractSubpath
            : contractSubpath + JAY_CONTRACT_EXTENSION;

        // Try common relative locations using resolveLink,
        // same mechanism as contract link resolution (linked-contract-resolver.ts)
        const candidates = [
            `./${subpathWithExt}`,
            `../contracts/${subpathWithExt}`,
            `./contracts/${subpathWithExt}`,
            `../${subpathWithExt}`,
        ];

        for (const candidate of candidates) {
            const absolutePath = importResolver.resolveLink(baseDir, candidate);
            if (fs.existsSync(absolutePath)) {
                const relativePath = path.relative(baseDir, absolutePath);
                const importPath = relativePath.startsWith('.')
                    ? relativePath
                    : './' + relativePath;
                return { importPath, viewStateName };
            }
        }

        // Try bare name via require.resolve (npm package)
        try {
            const absolutePath = importResolver.resolveLink(baseDir, subpathWithExt);
            const relativePath = path.relative(baseDir, absolutePath);
            const importPath = relativePath.startsWith('.')
                ? relativePath
                : './' + relativePath;
            return { importPath, viewStateName };
        } catch {
            return { importPath: './' + subpathWithExt, viewStateName };
        }
    };
}

export function jayDefinitions(projectRoot: string) {
    return {
        name: 'jay:definitions', // this name will show up in warnings and errors
        async load(id: string): Promise<LoadResult> {
            if (
                hasExtension(id, JAY_EXTENSION) ||
                hasExtension(id, JAY_CONTRACT_EXTENSION) ||
                hasExtension(id, JAY_ACTION_EXTENSION)
            ) {
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
                const imports: string[] = getJayHtmlImports(code).filter(
                    (module: string) => module && module.endsWith('jay-html.d'),
                );
                await Promise.all(
                    imports.map((imported) =>
                        context.load({
                            id: path.resolve(dirname, String(imported).slice(0, -2)),
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
                    projectRoot,
                );
                const tsCode: string = checkValidationErrors(
                    generateElementDefinitionFile(parsedFile),
                );
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

                const parsedFile = parseContract(code, filename);
                const tsCode = await compileContract(
                    parsedFile,
                    `${dirname}/${filename}`,
                    JAY_IMPORT_RESOLVER,
                );

                // Check validation errors before generating file
                const validatedTsCode: string = checkValidationErrors(tsCode);

                const generatedFilename = await writeDefinitionFile(
                    dirname,
                    filename,
                    validatedTsCode,
                    JAY_CONTRACT_DTS_EXTENSION,
                );

                context.info(`[transform] generated ${generatedFilename}`);

                return { code: '', map: null };
            } else if (hasExtension(id, JAY_ACTION_EXTENSION)) {
                const context = this as PluginContext;
                const { filename, dirname } = getFileContext(id, JAY_ACTION_EXTENSION);

                const parsedFile = parseAction(code, filename);

                const contractResolver = createContractResolver(dirname, JAY_IMPORT_RESOLVER);
                const tsCode = compileAction(parsedFile, contractResolver);

                const validatedTsCode: string = checkValidationErrors(tsCode);

                const generatedFilename = await writeDefinitionFile(
                    dirname,
                    filename,
                    validatedTsCode,
                    JAY_ACTION_DTS_EXTENSION,
                );

                context.info(`[transform] generated ${generatedFilename}`);

                return { code: '', map: null };
            }
            return null;
        },
    };
}
