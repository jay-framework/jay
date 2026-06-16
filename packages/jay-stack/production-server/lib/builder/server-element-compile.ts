import { build as viteBuild } from 'vite';
import { jayRuntime, type JayRollupConfig } from '@jay-framework/vite-plugin';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';
import {
    parseJayFile,
    generateServerElementFile,
    generateElementHydrateFile,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
    JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';
import {
    RuntimeMode,
    checkValidationErrors,
    type JayHtmlHeadMeta,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import { parse as parseHtml } from 'node-html-parser';
import { transform as esbuildTransform } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface ServerElementCompileResult {
    cssFile?: string;
    /** External URLs extracted from @import rules (e.g., Google Fonts) */
    cssImports?: string[];
    headMeta?: JayHtmlHeadMeta;
}

export async function compileServerElement(
    jayHtmlContent: string,
    jayHtmlFilename: string,
    jayHtmlDir: string,
    outputPath: string,
    projectRoot: string,
    tsConfigFilePath?: string,
    sourceDir?: string,
    minifyCss: boolean = true,
): Promise<ServerElementCompileResult> {
    const jayFile: WithValidations<JayHtmlSourceFile> = await parseJayFile(
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
    let cssImports: string[] | undefined;
    const css = (parsedJayFile as any).css as string | undefined;
    if (css) {
        cssImports = extractCssImportUrls(css);

        const cssFilename = path.basename(outputPath, '.server-element.js') + '.css';
        const cssPath = path.join(outputDir, cssFilename);
        if (minifyCss) {
            const minified = await esbuildTransform(css, { loader: 'css', minify: true });
            await fs.writeFile(cssPath, minified.code, 'utf-8');
        } else {
            await fs.writeFile(cssPath, css, 'utf-8');
        }
        cssFile = cssFilename;
    }

    getLogger().info(`[Build] Compiled server element: ${path.basename(outputPath)}`);
    return { cssFile, cssImports, headMeta: parsedJayFile.headMeta };
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
    minifyCss: boolean = true,
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
        minifyCss,
    );
}

export interface RouteHydrateCompileResult {
    jsFile: string;
}

/**
 * Compile a per-route hydrate script from the original jay-html (DL#144).
 * Phase-aware: only interactive bindings get coordinates and adoption code.
 * Produces a client-side ES module that exports `hydrate()`.
 */
export async function compileRouteHydrateScript(
    jayHtmlPath: string,
    outputDir: string,
    projectRoot: string,
    tsConfigFilePath?: string,
    minify: boolean = true,
): Promise<RouteHydrateCompileResult> {
    const jayHtmlContent = await fs.readFile(jayHtmlPath, 'utf-8');
    const sourceDir = path.dirname(jayHtmlPath);

    let jayHtml = injectHeadfullFSTemplates(jayHtmlContent, sourceDir, JAY_IMPORT_RESOLVER);
    jayHtml = resolveJayHtmlPaths(jayHtml, sourceDir, outputDir);

    const jayFile = await parseJayFile(
        jayHtml,
        path.basename(jayHtmlPath),
        outputDir,
        { relativePath: tsConfigFilePath },
        JAY_IMPORT_RESOLVER,
        projectRoot,
        sourceDir,
    );
    const parsedJayFile = checkValidationErrors(jayFile);

    const hydrateCode = checkValidationErrors(
        generateElementHydrateFile(parsedJayFile, RuntimeMode.MainTrusted),
    ) as string;

    await fs.mkdir(outputDir, { recursive: true });

    const tsPath = path.join(outputDir, 'route.hydrate.ts');
    await fs.writeFile(tsPath, hydrateCode, 'utf-8');

    const jayOptions: JayRollupConfig = { tsConfigFilePath };

    await viteBuild({
        root: projectRoot,
        plugins: [...jayStackCompiler(jayOptions)],
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify,
            manifest: 'route-hydrate-manifest.json',
            rollupOptions: {
                input: { 'route.hydrate': tsPath },
                external: (id) => id.startsWith('@jay-framework/'),
                output: {
                    entryFileNames: '[name]-[hash].js',
                    format: 'es',
                },
                preserveEntrySignatures: 'exports-only',
            },
        },
        logLevel: 'warn',
    });

    await fs.rm(tsPath, { force: true });

    const manifestPath = path.join(outputDir, 'route-hydrate-manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    await fs.rm(manifestPath, { force: true });

    const entryKey = Object.keys(manifest).find((k) => (manifest[k] as any).isEntry);
    if (!entryKey) throw new Error('No entry in route hydrate manifest');
    const jsFile = (manifest[entryKey] as any).file as string;

    getLogger().info(`[Build] Compiled route hydrate script: ${jsFile}`);
    return { jsFile };
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

/**
 * Extract external @import URLs from CSS for preload hints (DL#146).
 * Only extracts absolute URLs — relative @imports are local and don't need preloading.
 */
function extractCssImportUrls(css: string): string[] {
    const imports: string[] = [];
    const re = /@import\s*(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(css)) !== null) {
        const url = match[1] || match[2];
        if (url.startsWith('https://')) {
            imports.push(url);
        }
    }
    return imports;
}
