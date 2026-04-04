import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
    type ServerElementOptions,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors, JAY_QUERY_HYDRATE } from '@jay-framework/compiler-shared';
import { asyncSwapScript, type ServerRenderContext } from '@jay-framework/ssr-runtime';
import type { ViteDevServer } from 'vite';
import type { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';
import {
    buildScriptFragments,
    buildAutomationWrap,
    generatePromiseReconstruction,
    type ProjectClientInitInfo,
    type GenerateClientScriptOptions,
} from './generate-client-script';
import type { PluginClientInitInfo } from './plugin-init-discovery';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getLogger } from '@jay-framework/logger';

// ============================================================================
// Server Element Module Cache
// ============================================================================

interface CachedServerModule {
    renderToStream: (vs: object, ctx: ServerRenderContext) => void;
    headLinks: Array<{ rel: string; href: string; attributes: Record<string, string> }>;
    cssHref?: string;
}

/**
 * Cache of compiled server element modules, keyed by jay-html file path.
 * Avoids re-parsing, re-generating, and re-loading the server element
 * on every request for the same route.
 */
const serverModuleCache = new Map<string, CachedServerModule>();

/**
 * Invalidate the cached server element module for a jay-html file.
 * Called when the source file changes (via file watcher).
 */
export function invalidateServerElementCache(jayHtmlPath: string): void {
    if (serverModuleCache.delete(jayHtmlPath)) {
        getLogger().info(`[SSR] Invalidated server element cache for ${jayHtmlPath}`);
    }
}

/**
 * Invalidate all cached server element modules.
 */
export function clearServerElementCache(): void {
    serverModuleCache.clear();
}

// ============================================================================
// SSR Page Generation
// ============================================================================

/**
 * Generate a complete SSR HTML page with server-rendered content and hydration script.
 *
 * Flow:
 * 1. Load (or reuse cached) server element module
 * 2. Execute renderToStream() to produce HTML
 * 3. Build hydration script (uses ?jay-hydrate query for hydrate target)
 * 4. Return full HTML page string
 */
export async function generateSSRPageHtml(
    vite: ViteDevServer,
    jayHtmlContent: string,
    jayHtmlFilename: string,
    jayHtmlDir: string,
    viewState: object,
    jayHtmlImportPath: string,
    parts: DevServerPagePart[],
    carryForward: object,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, Record<string, any>> = {},
    buildFolder: string,
    projectRoot: string,
    routeDir: string,
    tsConfigFilePath?: string,
    projectInit?: ProjectClientInitInfo,
    pluginInits: PluginClientInitInfo[] = [],
    options: GenerateClientScriptOptions = {},
): Promise<string> {
    const jayHtmlPath = path.join(jayHtmlDir, jayHtmlFilename);

    // Step 1: Get server element module (cached or compile fresh)
    let cached = serverModuleCache.get(jayHtmlPath);
    if (!cached) {
        cached = await compileAndLoadServerElement(
            vite,
            jayHtmlContent,
            jayHtmlFilename,
            jayHtmlDir,
            buildFolder,
            projectRoot,
            routeDir,
            tsConfigFilePath,
        );
        serverModuleCache.set(jayHtmlPath, cached);
    }

    // Step 2: Render HTML to buffer
    const htmlChunks: string[] = [];
    const asyncPromises: Array<Promise<string>> = [];
    const asyncOutcomes: Array<{ id: string; status: 'resolved' | 'rejected'; value: any }> = [];

    const ctx: ServerRenderContext = {
        write: (chunk: string) => {
            htmlChunks.push(chunk);
        },
        onAsync: (promise, id, templates) => {
            const asyncPromise = promise.then(
                (val) => {
                    asyncOutcomes.push({ id, status: 'resolved', value: val });
                    if (templates.resolved) {
                        return asyncSwapScript(id, templates.resolved(val));
                    }
                    return '';
                },
                (err) => {
                    asyncOutcomes.push({
                        id,
                        status: 'rejected',
                        value: { message: err?.message ?? String(err) },
                    });
                    if (templates.rejected) {
                        return asyncSwapScript(id, templates.rejected(err));
                    }
                    return '';
                },
            );
            asyncPromises.push(asyncPromise);
        },
    };

    cached.renderToStream(viewState, ctx);

    // Wait for all async content to resolve
    // (In buffered mode we wait for everything before sending)
    const asyncResults = await Promise.all(asyncPromises);
    const ssrHtml = htmlChunks.join('');

    // Async swap scripts replace pending placeholders with resolved/rejected content
    const asyncScripts = asyncResults.filter((r) => r !== '').join('');

    // Step 3: Build hydration script
    const hydrationScript = generateHydrationScript(
        viewState,
        carryForward,
        parts,
        jayHtmlImportPath,
        trackByMap,
        clientInitData,
        projectInit,
        pluginInits,
        options,
        asyncOutcomes,
    );

    // Step 4: Build head links from jay-html <head> section
    // CSS is served via a Vite-processed <link> tag — this gives us PostCSS, @import
    // resolution, HMR, and avoids duplication with the hydrate module.
    const headLinksHtml = cached.headLinks
        .map((link) => {
            const attrs = Object.entries(link.attributes)
                .map(([k, v]) => ` ${k}="${v}"`)
                .join('');
            return `    <link rel="${link.rel}" href="${link.href}"${attrs} />`;
        })
        .join('\n');
    const cssLink = cached.cssHref
        ? `    <link rel="stylesheet" href="${cached.cssHref}" />`
        : '';

    // Step 5: Build full HTML page
    const headExtras = [headLinksHtml, cssLink].filter((_) => _).join('\n');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
${headExtras ? headExtras + '\n' : ''}  </head>
  <body>
    <div id="target">${ssrHtml}</div>${asyncScripts}
    ${hydrationScript}
  </body>
</html>`;
}

/**
 * Rebase relative import paths in generated code from one directory to another.
 * The compiler calculates import paths relative to the source jay-html directory,
 * but the generated server-element file lives in a different directory (build/pre-rendered/{routeDir}/).
 */
function rebaseRelativeImports(code: string, fromDir: string, toDir: string): string {
    return code.replace(/from "(\.\.\/[^"]+)"/g, (_match, relPath) => {
        const absolutePath = path.resolve(fromDir, relPath);
        let newRelPath = path.relative(toDir, absolutePath);
        if (!newRelPath.startsWith('.')) {
            newRelPath = './' + newRelPath;
        }
        return `from "${newRelPath}"`;
    });
}

/**
 * Compile a jay-html file into a server element module.
 * Parses the jay-html, generates server element TS code,
 * writes it to the build folder, and loads it via Vite SSR.
 */
async function compileAndLoadServerElement(
    vite: ViteDevServer,
    jayHtmlContent: string,
    jayHtmlFilename: string,
    jayHtmlDir: string,
    buildFolder: string,
    projectRoot: string,
    routeDir: string,
    tsConfigFilePath?: string,
): Promise<CachedServerModule> {
    const jayFile = await parseJayFile(
        jayHtmlContent,
        jayHtmlFilename,
        jayHtmlDir,
        { relativePath: tsConfigFilePath },
        JAY_IMPORT_RESOLVER,
        projectRoot,
    );
    const parsedJayFile = checkValidationErrors(jayFile);

    // Construct debug path for coordinate pre-process output
    const pageName = jayHtmlFilename.replace('.jay-html', '');
    const debugCoordinatePreprocessPath = path.join(
        buildFolder,
        'debug',
        routeDir,
        `${pageName}.coordinate-preprocess.jay-html`,
    );

    const serverElementOptions: ServerElementOptions = {
        debugCoordinatePreprocessPath,
    };

    const serverElementCode = checkValidationErrors(
        generateServerElementFile(parsedJayFile, serverElementOptions),
    );

    const serverElementDir = path.join(buildFolder, 'pre-rendered', routeDir);
    await fs.mkdir(serverElementDir, { recursive: true });

    // Rebase relative import paths: the compiler calculates them relative to jayHtmlDir,
    // but the server-element file lives in serverElementDir.
    const adjustedCode = rebaseRelativeImports(serverElementCode, jayHtmlDir, serverElementDir);

    const serverElementFilename = jayHtmlFilename.replace('.jay-html', '.server-element.ts');
    const serverElementPath = path.join(serverElementDir, serverElementFilename);
    await fs.writeFile(serverElementPath, adjustedCode, 'utf-8');

    // Invalidate Vite's module graph for this path — the build/ directory is in the
    // watcher ignore list, so Vite won't detect the file was overwritten and would
    // return a stale cached module without this.
    const existingModule = vite.moduleGraph.getModuleById(serverElementPath);
    if (existingModule) {
        vite.moduleGraph.invalidateModule(existingModule);
    }

    const serverModule = await vite.ssrLoadModule(serverElementPath);

    // Write CSS to the build folder beside the server element and serve it as a real file.
    let cssHref: string | undefined;
    if (parsedJayFile.css) {
        const cssFilename = jayHtmlFilename.replace('.jay-html', '.css');
        const cssPath = path.join(serverElementDir, cssFilename);
        await fs.writeFile(cssPath, parsedJayFile.css, 'utf-8');

        // Invalidate Vite's module graph for the CSS file — same reason as server element above.
        const cssModules = vite.moduleGraph.getModulesByFile(cssPath);
        if (cssModules) {
            for (const mod of cssModules) {
                vite.moduleGraph.invalidateModule(mod);
            }
        }

        const hash = crypto.createHash('md5').update(parsedJayFile.css).digest('hex').slice(0, 8);
        cssHref = '/@fs' + cssPath + '?v=' + hash;
    }

    return {
        renderToStream: serverModule.renderToStream as (
            vs: object,
            ctx: ServerRenderContext,
        ) => void,
        headLinks: parsedJayFile.headLinks,
        cssHref,
    };
}

/**
 * Generate the hydration script that adopts the server-rendered DOM.
 * Uses shared buildScriptFragments() and buildAutomationWrap() from generate-client-script.
 */
function generateHydrationScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    jayHtmlPath: string,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, Record<string, any>> = {},
    projectInit?: ProjectClientInitInfo,
    pluginInits: PluginClientInitInfo[] = [],
    options: GenerateClientScriptOptions = {},
    asyncOutcomes: Array<{ id: string; status: 'resolved' | 'rejected'; value: any }> = [],
): string {
    const {
        partImports,
        compositeParts,
        pluginClientInitImports,
        projectInitImport,
        clientInitExecution,
        automationImport,
        slowViewStateDecl,
    } = buildScriptFragments(parts, clientInitData, projectInit, pluginInits, options);
    const automationWrap = buildAutomationWrap(options, 'hydrate');

    // Build the hydrate import path: append ?jay-hydrate to the jay-html path
    const hydrateImportPath = `${jayHtmlPath}${JAY_QUERY_HYDRATE}`;

    return `<script type="module">
      import {hydrateCompositeJayComponent} from "@jay-framework/stack-client-runtime";
      ${automationImport}
      ${pluginClientInitImports}
      ${projectInitImport}
      import { hydrate } from '${hydrateImportPath}';
      ${partImports}${slowViewStateDecl}
      const viewState = ${JSON.stringify(defaultViewState)};
${generatePromiseReconstruction(asyncOutcomes)}      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};

      const target = document.getElementById('target');
      const rootElement = target.firstElementChild;
      const pageComp = hydrateCompositeJayComponent(hydrate, viewState, fastCarryForward, ${compositeParts}, trackByMap, rootElement);
${clientInitExecution}
      const instance = pageComp({/* placeholder for page props */});
${automationWrap}
    </script>`;
}
