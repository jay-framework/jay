/**
 * SSR-render a scratch explore option's page.jay-html using production page phases.
 * Used by dev-only scratch preview HTTP routes (AIditor explore canvas iframes).
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { JayRollupConfig } from '@jay-framework/rollup-plugin';
import {
    DevSlowlyChangingPhase,
    renderFastChangingData,
} from '@jay-framework/stack-server-runtime';
import { loadPageParts, generateFrozenPageHtml } from '@jay-framework/stack-server-build';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { injectHeadfullFSTemplates, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { getLogger } from '@jay-framework/logger';

export type ScratchPagePreviewInput = {
    routePath: string;
    scratchJayHtmlPath: string;
    pageParams?: Record<string, string>;
    /** Dev only: inject minimal HMR reload listener (DL#179). */
    injectDevHmr?: boolean;
    /** Request URL for vite.transformIndexHtml when injectDevHmr is true. */
    requestUrl?: string;
};

export type ScratchPagePreviewResult =
    | { ok: true; html: string }
    | { ok: false; error: string };

function getRouteDir(route: JayRoute): string {
    return route.rawRoute.replace(/^\//, '') || 'index';
}

export async function renderScratchPagePreview(
    vite: ViteDevServer,
    route: JayRoute,
    input: ScratchPagePreviewInput,
    pagesBase: string,
    projectBase: string,
    buildFolder: string,
    jayRollupConfig: JayRollupConfig,
): Promise<ScratchPagePreviewResult> {
    try {
        const pageParams = input.pageParams ?? {};
        const pageProps = {};

        const partsResult = await loadPageParts(
            vite,
            route,
            pagesBase,
            projectBase,
            jayRollupConfig,
        );
        if (!partsResult.val) {
            return {
                ok: false,
                error: partsResult.validations.join('; ') || 'Failed to load page parts',
            };
        }

        const {
            parts: pageParts,
            serverTrackByMap,
            headlessInstanceComponents,
            discoveredInstances,
            forEachInstances,
        } = partsResult.val;

        const slowlyPhase = new DevSlowlyChangingPhase();
        const renderedSlowly = await slowlyPhase.runSlowlyForPage(
            pageParams,
            pageProps,
            pageParts,
            discoveredInstances,
            headlessInstanceComponents,
            route.jayHtmlPath,
        );
        if (renderedSlowly.kind !== 'PhaseOutput') {
            return {
                ok: false,
                error: `Slow phase failed for route ${input.routePath}`,
            };
        }

        const instancePhaseData = (renderedSlowly.carryForward as { __instances?: unknown })
            ?.__instances;
        const renderedFast = await renderFastChangingData(
            pageParams,
            pageProps,
            renderedSlowly.carryForward,
            pageParts,
            instancePhaseData as Parameters<typeof renderFastChangingData>[3],
            forEachInstances,
            headlessInstanceComponents,
            renderedSlowly.rendered,
            {},
            {},
        );
        if (renderedFast.kind !== 'PhaseOutput') {
            return {
                ok: false,
                error: `Fast phase failed for route ${input.routePath}`,
            };
        }

        const nonCachedInstanceSlowVS = (
            instancePhaseData as { slowViewStates?: Record<string, unknown> } | undefined
        )?.slowViewStates;
        const fullSlowVS =
            nonCachedInstanceSlowVS && Object.keys(nonCachedInstanceSlowVS).length > 0
                ? { ...renderedSlowly.rendered, __headlessInstances: nonCachedInstanceSlowVS }
                : renderedSlowly.rendered;

        const viewState = deepMergeViewStates(
            fullSlowVS,
            renderedFast.rendered,
            serverTrackByMap || {},
        );

        const productionJayHtmlDir = path.dirname(route.jayHtmlPath);
        const scratchJayHtmlContent = await fs.readFile(input.scratchJayHtmlPath, 'utf-8');
        const injectedJayHtml = injectHeadfullFSTemplates(
            scratchJayHtmlContent,
            productionJayHtmlDir,
            JAY_IMPORT_RESOLVER,
        );

        const routeDir = getRouteDir(route);
        let html = await generateFrozenPageHtml(
            vite,
            injectedJayHtml,
            path.basename(input.scratchJayHtmlPath),
            productionJayHtmlDir,
            viewState,
            buildFolder,
            projectBase,
            routeDir,
            jayRollupConfig?.tsConfigFilePath,
            path.join(projectBase, 'src'),
            'page',
            undefined,
            input.injectDevHmr ? { injectDevHmr: true } : undefined,
        );

        if (input.injectDevHmr) {
            html = await vite.transformIndexHtml(input.requestUrl ?? '/', html);
        }

        return { ok: true, html };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        getLogger().warn(`[ScratchPreview] ${message}`);
        return { ok: false, error: message };
    }
}
