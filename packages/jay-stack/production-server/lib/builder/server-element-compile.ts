import { build as viteBuild } from 'vite';
import { jayRuntime, type JayRollupConfig } from '@jay-framework/vite-plugin';
import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors } from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import { parse as parseHtml } from 'node-html-parser';
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

    const serverElementCode = checkValidationErrors(generateServerElementFile(parsedJayFile));

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

/**
 * Compile a per-route server element from the original jay-html (DL#144).
 * All bindings (slow, fast, interactive) are dynamic — read from ViewState at render time.
 *
 * Unlike per-instance compilation where jayHtmlDir === outputDir, here the source
 * directory differs from the output directory. We resolve all relative paths in the
 * jay-html to absolute before parsing, so the generated TypeScript imports are
 * resolvable from the output directory.
 */
export async function compileRouteServerElement(
    jayHtmlPath: string,
    outputPath: string,
    projectRoot: string,
    tsConfigFilePath?: string,
): Promise<ServerElementCompileResult> {
    const jayHtmlContent = await fs.readFile(jayHtmlPath, 'utf-8');
    const sourceDir = path.dirname(jayHtmlPath);
    const outputDir = path.dirname(outputPath);

    let jayHtml = injectHeadfullFSTemplates(jayHtmlContent, sourceDir, JAY_IMPORT_RESOLVER);
    jayHtml = resolveJayHtmlPaths(jayHtml, sourceDir, outputDir);

    return compileServerElement(
        jayHtml,
        path.basename(jayHtmlPath),
        outputDir,
        outputPath,
        projectRoot,
        tsConfigFilePath,
        sourceDir,
    );
}

/**
 * Rewrite relative paths in jay-html script/link tags so they resolve from `targetDir`.
 * Resolves each relative path to absolute via `sourceDir`, then makes it relative to `targetDir`.
 */
function resolveJayHtmlPaths(html: string, sourceDir: string, targetDir: string): string {
    const root = parseHtml(html, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });

    const rewrite = (el: any, attr: string) => {
        const val = el.getAttribute(attr);
        if (val && (val.startsWith('./') || val.startsWith('../'))) {
            const abs = path.resolve(sourceDir, val);
            let rel = path.relative(targetDir, abs);
            if (!rel.startsWith('.')) rel = './' + rel;
            el.setAttribute(attr, rel);
        }
    };

    for (const el of root.querySelectorAll('script[type="application/jay-data"]')) {
        rewrite(el, 'contract');
    }
    for (const el of root.querySelectorAll('script[type="application/jay-headless"]')) {
        rewrite(el, 'src');
        rewrite(el, 'contract');
    }
    for (const el of root.querySelectorAll('script[type="application/jay-headfull"]')) {
        rewrite(el, 'src');
        rewrite(el, 'contract');
    }
    for (const el of root.querySelectorAll('link[rel="stylesheet"]')) {
        rewrite(el, 'href');
    }

    return root.toString();
}
