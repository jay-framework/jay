import { build as viteBuild } from 'vite';
import { jayRuntime, type JayRollupConfig } from '@jay-framework/vite-plugin';
import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors } from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

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

    const jayOptions: JayRollupConfig = { tsConfigFilePath };

    await viteBuild({
        root: projectRoot,
        plugins: [jayRuntime(jayOptions)],
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify: false,
            ssr: true,
            rollupOptions: {
                input: { [path.basename(outputPath, '.js')]: tsPath },
                external: [/^node:/, /^@jay-framework\//],
                output: {
                    entryFileNames: '[name].js',
                    format: 'es',
                },
            },
        },
        logLevel: 'warn',
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
