import { build, type Plugin as EsbuildPlugin } from 'esbuild';
import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
    parseContract,
    type ServerElementOptions,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors, JayEnumType } from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

function jayContractPlugin(): EsbuildPlugin {
    return {
        name: 'jay-contract',
        setup(build) {
            build.onResolve({ filter: /\.jay-contract$/ }, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path);
                return { path: resolved, namespace: 'jay-contract' };
            });
            build.onLoad({ filter: /.*/, namespace: 'jay-contract' }, async (args) => {
                const content = await fs.readFile(args.path, 'utf-8');
                const result = parseContract(content, path.basename(args.path));
                if (!result.val) {
                    return { contents: 'export {}', loader: 'ts' };
                }
                const contract = result.val;
                const lines: string[] = [];
                for (const tag of contract.tags) {
                    if (tag.dataType instanceof JayEnumType) {
                        lines.push(`export enum ${tag.dataType.name} { ${tag.dataType.values.join(', ')} }`);
                    }
                }
                const safeName = contract.name.replace(/-./g, (m) => m[1].toUpperCase());
                const pascalName = safeName.charAt(0).toUpperCase() + safeName.slice(1);
                lines.push(`export interface ${pascalName}ViewState {}`);
                return { contents: lines.join('\n'), loader: 'ts' };
            });
        },
    };
}

export interface ServerElementCompileResult {
    cssFile?: string;
}

export async function compileServerElement(
    jayHtmlContent: string,
    jayHtmlFilename: string,
    jayHtmlDir: string,
    outputPath: string,
    projectRoot: string,
    tsConfigFilePath?: string,
    sourceDir?: string,
): Promise<ServerElementCompileResult> {
    const jayFile = await parseJayFile(
        jayHtmlContent,
        jayHtmlFilename,
        jayHtmlDir,
        { relativePath: tsConfigFilePath },
        JAY_IMPORT_RESOLVER,
        projectRoot,
        sourceDir,
    );
    const parsedJayFile = checkValidationErrors(jayFile);

    const serverElementCode = checkValidationErrors(
        generateServerElementFile(parsedJayFile),
    );

    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    const tsPath = outputPath.replace(/\.js$/, '.ts');
    await fs.writeFile(tsPath, serverElementCode as string, 'utf-8');

    await build({
        entryPoints: [tsPath],
        outfile: outputPath,
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'es2020',
        plugins: [jayContractPlugin()],
    });

    await fs.rm(tsPath, { force: true });

    let cssFile: string | undefined;
    const css = (parsedJayFile as any).css as string | undefined;
    if (css) {
        const cssFilename = path.basename(outputPath, '.server-element.js') + '.css';
        const cssPath = path.join(outputDir, cssFilename);
        await fs.writeFile(cssPath, css, 'utf-8');
        cssFile = cssFilename;
    }

    getLogger().info(`[Build] Compiled server element: ${path.basename(outputPath)}`);
    return { cssFile };
}
