import type { ErrorPageEntry } from '@jay-framework/production-server';
import type { JayErrorPages } from '@jay-framework/stack-route-scanner';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import { compileRouteServerElement, compileRouteHydrateScript } from './server-element-compile';
import { generateRouteHydrationEntry } from './hydration-entry-gen';
import { buildInstanceClient } from './instance-client-build';
import { loadProductionPageParts } from './load-production-parts';
import type { InstanceBuildContext } from './instance-pipeline';

/**
 * Build all error pages (DL#218), compiling each like a single-instance route into the
 * `_errors/<token>/` subtree. Error pages are resolved by status (never by URL), so they are
 * compiled here and recorded on `manifest.errorPages` rather than in `routes[]` — which also
 * keeps them out of the sitemap/llms.txt/robots and internal-link validation.
 *
 * An error page runs no author fast phase — the framework injects the `error` ViewState at
 * render (Q6) — so no slow/instance pre-render happens here; only the server element, hydrate
 * script and client bundle are produced (enabling static chrome + optional interactivity).
 */
export async function buildErrorPages(
    errorPages: JayErrorPages,
    ctx: InstanceBuildContext,
    projectRoot: string,
    pagesRoot: string,
    tsConfigFilePath: string,
    minify: boolean,
    sharedManifest: Record<string, string>,
    buildDir: string,
): Promise<Record<string, ErrorPageEntry>> {
    const logger = getLogger();
    const result: Record<string, ErrorPageEntry> = {};

    for (const errorPage of errorPages) {
        if (!errorPage.jayHtmlPath) {
            logger.warn(`[Build] Error page ${errorPage.token} has no page.jay-html — skipped`);
            continue;
        }

        const outputDirName = path.join('_errors', errorPage.token);
        const backendPageDir = path.join(ctx.backendDir, 'pre-rendered', outputDirName);
        const frontendPageDir = path.join(ctx.frontendDir, 'pages', outputDirName);
        await fs.mkdir(backendPageDir, { recursive: true });
        await fs.mkdir(frontendPageDir, { recursive: true });

        const entry: ErrorPageEntry = {
            token: errorPage.token,
            serverElementPath: '',
        };

        // 1. Server element
        const serverElementPath = path.join(backendPageDir, 'route.server-element.js');
        try {
            const seResult = await compileRouteServerElement(
                errorPage.jayHtmlPath,
                serverElementPath,
                projectRoot,
                tsConfigFilePath,
                minify,
            );
            entry.serverElementPath = path.relative(ctx.backendDir, serverElementPath);

            if (seResult.cssFile) {
                const srcCss = path.join(backendPageDir, seResult.cssFile);
                const dstCss = path.join(frontendPageDir, seResult.cssFile);
                try {
                    await fs.rename(srcCss, dstCss);
                } catch {
                    await fs.copyFile(srcCss, dstCss);
                    await fs.rm(srcCss, { force: true });
                }
                entry.routeCssPath = path.relative(ctx.frontendDir, dstCss);
            }
            if (seResult.cssImports?.length) entry.cssImports = seResult.cssImports;
            if (seResult.headMeta) entry.headMeta = seResult.headMeta;
            if (seResult.scripts?.length) entry.scripts = seResult.scripts;

            logger.important(`[Build] Error page server element: ${errorPage.token}`);
        } catch (err: any) {
            logger.error(
                `[Build] Error page server element FAILED ${errorPage.token}: ${err.message}`,
            );
            continue;
        }

        // 2. Hydrate script
        try {
            const hydrateResult = await compileRouteHydrateScript(
                errorPage.jayHtmlPath,
                frontendPageDir,
                projectRoot,
                tsConfigFilePath,
                minify,
            );
            entry.routeHydratePath = path.relative(
                ctx.frontendDir,
                path.join(frontendPageDir, hydrateResult.jsFile),
            );

            try {
                const hydrateCode = await fs.readFile(
                    path.join(frontendPageDir, hydrateResult.jsFile),
                    'utf-8',
                );
                const importMatches = hydrateCode.match(/from\s*"([^"]+)"/g) || [];
                const deps = importMatches
                    .map((m) => m.replace(/^from\s*"/, '').replace(/"$/, ''))
                    .filter((dep) => sharedManifest[dep]);
                if (deps.length > 0) entry.sharedDeps = deps;
            } catch {
                // Could not extract deps — fall back to all shared chunks at serve time
            }

            logger.important(`[Build] Error page hydrate script: ${errorPage.token}`);
        } catch (err: any) {
            logger.error(
                `[Build] Error page hydrate script FAILED ${errorPage.token}: ${err.message}`,
            );
            // Server element already built — keep the entry (static render still works).
            result[errorPage.token] = entry;
            continue;
        }

        // 3. Client bundle (hydrate entry + optional co-located page.ts)
        try {
            const ROUTE_HYDRATE_KEY = 'jay-route-hydrate';
            let pageModulePath = '';
            if (errorPage.compPath) {
                pageModulePath = './' + path.relative(frontendPageDir, errorPage.compPath);
            }

            const pageParts = await loadProductionPageParts(
                { jayHtmlPath: errorPage.jayHtmlPath },
                {},
                await fs.readFile(errorPage.jayHtmlPath, 'utf-8'),
                projectRoot,
                tsConfigFilePath,
                path.join(ctx.backendDir, 'server'),
            );

            entry.trackByMap = pageParts.serverTrackByMap || pageParts.clientTrackByMap;

            const entryPath = path.join(frontendPageDir, 'route.entry.ts');
            await generateRouteHydrationEntry({
                hydrateImport: ROUTE_HYDRATE_KEY,
                pageModulePath,
                pageExportName: 'page',
                trackByMap: pageParts.clientTrackByMap || {},
                outputPath: entryPath,
                keyedParts: pageParts.keyedPartModules,
                clientInits: ctx.clientInits,
            });

            const clientResult = await buildInstanceClient(
                entryPath,
                'route.client',
                frontendPageDir,
                projectRoot,
                { tsConfigFilePath },
                minify,
                pagesRoot,
                buildDir,
            );
            await fs.rm(entryPath, { force: true });

            entry.routeClientBundlePath = path.relative(
                ctx.frontendDir,
                path.join(frontendPageDir, clientResult.jsFile),
            );

            try {
                const clientCode = await fs.readFile(
                    path.join(frontendPageDir, clientResult.jsFile),
                    'utf-8',
                );
                const clientImports = (clientCode.match(/from\s*"([^"]+)"/g) || [])
                    .map((m) => m.replace(/^from\s*"/, '').replace(/"$/, ''))
                    .filter((dep) => sharedManifest[dep]);
                const existing = new Set(entry.sharedDeps || []);
                for (const dep of clientImports) existing.add(dep);
                if (existing.size > 0) entry.sharedDeps = [...existing];
            } catch {
                // Fall back to hydrate-only deps
            }

            logger.important(`[Build] Error page client bundle: ${errorPage.token}`);
        } catch (err: any) {
            logger.error(
                `[Build] Error page client bundle FAILED ${errorPage.token}: ${err.message}`,
            );
        }

        result[errorPage.token] = entry;
    }

    return result;
}
