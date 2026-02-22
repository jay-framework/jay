import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors, JAY_QUERY_HYDRATE } from '@jay-framework/compiler-shared';
import type { ServerRenderContext } from '@jay-framework/ssr-runtime';
import type { ViteDevServer } from 'vite';
import type { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';
import {
    buildScriptFragments,
    buildAutomationWrap,
    type ProjectClientInitInfo,
    type GenerateClientScriptOptions,
} from './generate-client-script';
import type { PluginClientInitInfo } from './plugin-init-discovery';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';

// ============================================================================
// Server Element Module Cache
// ============================================================================

interface CachedServerModule {
    renderToStream: (vs: object, ctx: ServerRenderContext) => void;
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
            tsConfigFilePath,
        );
        serverModuleCache.set(jayHtmlPath, cached);
    }

    // Step 2: Render HTML to buffer
    const htmlChunks: string[] = [];
    const asyncPromises: Array<Promise<string>> = [];

    const ctx: ServerRenderContext = {
        write: (chunk: string) => {
            htmlChunks.push(chunk);
        },
        onAsync: (promise, id, templates) => {
            const asyncPromise = promise.then(
                (val) => {
                    if (templates.resolved) {
                        return templates.resolved(val);
                    }
                    return '';
                },
                (err) => {
                    if (templates.rejected) {
                        return templates.rejected(err);
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

    // Append async swap scripts for any resolved async content
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
    );

    // Step 4: Build full HTML page
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    <div id="target">${ssrHtml}</div>${asyncScripts}
    ${hydrationScript}
  </body>
</html>`;
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
    const serverElementCode = checkValidationErrors(generateServerElementFile(parsedJayFile));

    const serverElementsDir = path.join(buildFolder, 'server-elements');
    await fs.mkdir(serverElementsDir, { recursive: true });

    const serverElementFilename = jayHtmlFilename.replace('.jay-html', '.server-element.ts');
    const serverElementPath = path.join(serverElementsDir, serverElementFilename);
    await fs.writeFile(serverElementPath, serverElementCode, 'utf-8');

    const serverModule = await vite.ssrLoadModule(serverElementPath);

    return {
        renderToStream: serverModule.renderToStream as (
            vs: object,
            ctx: ServerRenderContext,
        ) => void,
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
): string {
    const f = buildScriptFragments(parts, clientInitData, projectInit, pluginInits, options);
    const automationWrap = buildAutomationWrap(options, 'hydrate');

    // Build the hydrate import path: append ?jay-hydrate to the jay-html path
    const hydrateImportPath = `${jayHtmlPath}${JAY_QUERY_HYDRATE}`;

    return `<script type="module">
      import {hydrateCompositeJayComponent} from "@jay-framework/stack-client-runtime";
      ${f.automationImport}
      ${f.pluginClientInitImports}
      ${f.projectInitImport}
      import { hydrate } from '${hydrateImportPath}';
      ${f.partImports}${f.slowViewStateDecl}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};
${f.clientInitExecution}
      const target = document.getElementById('target');
      const rootElement = target.firstElementChild;
      const pageComp = hydrateCompositeJayComponent(hydrate, viewState, fastCarryForward, ${f.compositeParts}, trackByMap, rootElement);

      const instance = pageComp({/* placeholder for page props */});
${automationWrap}
    </script>`;
}
