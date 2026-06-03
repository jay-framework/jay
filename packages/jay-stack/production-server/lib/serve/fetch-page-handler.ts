import type { RouteManifest } from '../types';
import type { MatchResult } from './route-matcher';
import type { ArtifactStore } from './artifact-store';
import {
    renderFastChangingData,
    mergeHeadTags,
    serializeHeadTags,
    getClientInitData,
} from '@jay-framework/stack-server-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { asyncSwapScript } from '@jay-framework/ssr-runtime';
import { buildImportMap } from './import-map';
import {
    loadPagePartsFromConfig,
    type ProductionPageParts,
} from '../builder/load-production-parts';
import type { RouteEntry } from '../types';
import path from 'node:path';

const pagePartsCache = new Map<string, ProductionPageParts>();

async function getPageParts(
    route: RouteEntry,
    artifacts: ArtifactStore,
    cachePath: string,
): Promise<ProductionPageParts> {
    const cacheKey = route.pattern;
    const cached = pagePartsCache.get(cacheKey);
    if (cached) return cached;

    const routeDir = path.dirname(cachePath);
    const configPath = artifacts.getAssetPath(path.join(routeDir, 'page-parts.json'));

    const parts = await loadPagePartsFromConfig(configPath, artifacts);

    pagePartsCache.set(cacheKey, parts);
    return parts;
}

export async function fetchPageRequest(
    match: MatchResult,
    manifest: RouteManifest,
    requestUrl: URL,
    artifacts: ArtifactStore,
    staticBaseUrl: string,
    cookies: Record<string, string> = {},
): Promise<Response> {
    const { route, instance } = match;
    const t0 = Date.now();

    const [cached, pageParts] = await Promise.all([
        artifacts.readCacheData(instance.cachePath),
        getPageParts(route, artifacts, instance.cachePath),
    ]);
    const tData = Date.now();

    const query = Object.fromEntries(requestUrl.searchParams.entries());

    const fastResult = await renderFastChangingData(
        match.params,
        { params: match.params, query },
        cached.carryForward,
        pageParts.parts,
        (cached.carryForward as any).__instances,
        pageParts.forEachInstances,
        pageParts.headlessInstanceComponents,
        cached.slowViewState,
        query,
        cookies,
    );
    const tFast = Date.now();

    if (fastResult.kind === 'Redirect3xx') {
        return new Response(null, {
            status: (fastResult as any).status,
            headers: { Location: (fastResult as any).location },
        });
    }
    if (fastResult.kind === 'ServerError5xx' || fastResult.kind === 'ClientError4xx') {
        return new Response((fastResult as any).message || 'Error', {
            status: (fastResult as any).status,
        });
    }

    const fastViewState = (fastResult as any).rendered || {};
    const fastCarryForward = (fastResult as any).carryForward || {};

    const headTagSources: any[][] = [];
    const slowHeadTags = (cached.carryForward as any).__slowHeadTags;
    if (slowHeadTags) headTagSources.push(...slowHeadTags);
    const fastHeadTags = (fastResult as any).headTags;
    if (fastHeadTags) headTagSources.push(fastHeadTags);
    const headTags = headTagSources.length > 0 ? mergeHeadTags(headTagSources) : [];
    const headTagsHtml = headTags.length > 0 ? serializeHeadTags(headTags) + '\n' : '';

    const fullViewState = deepMergeViewStates(
        cached.slowViewState,
        fastViewState,
        route.trackByMap || {},
    );

    const serverElementPath = route.serverElementPath || instance.serverElementPath;
    const serverElement = await artifacts.loadServerElement(serverElementPath);
    const asyncPromises: Promise<string>[] = [];

    const importMap = buildImportMap(manifest.sharedManifest, staticBaseUrl);
    if (route.routeHydratePath) {
        importMap['jay-route-hydrate'] = `${staticBaseUrl}${route.routeHydratePath}`;
    }
    const modulePreloads = Object.values(importMap)
        .map((url) => `    <link rel="modulepreload" href="${url}" />`)
        .join('\n');
    const cssLink = instance.clientCssPath
        ? `    <link rel="stylesheet" href="${staticBaseUrl}${instance.clientCssPath}" />`
        : '';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const write = (s: string) => controller.enqueue(encoder.encode(s));

            const headParts = [headTagsHtml, modulePreloads, cssLink].filter(Boolean).join('\n');
            write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headParts}
    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
  </head>
  <body>
    <div id="target">`);

            const tSsrStart = Date.now();
            serverElement.renderToStream(fullViewState, {
                write: (chunk: string) => write(chunk),
                onAsync: (promise, id, templates) => {
                    asyncPromises.push(
                        promise.then(
                            (val) => asyncSwapScript(id, templates.resolved(val)),
                            (err) => asyncSwapScript(id, templates.rejected(err)),
                        ),
                    );
                },
            });
            const tSsr = Date.now();

            write('</div>');

            const asyncScripts = (await Promise.all(asyncPromises)).filter((s) => s).join('');
            if (asyncScripts) write(asyncScripts);

            const clientInitData = getClientInitData();
            const clientBundleUrl = route.routeClientBundlePath
                ? `${staticBaseUrl}${route.routeClientBundlePath}`
                : `${staticBaseUrl}${instance.clientBundlePath}`;
            const initArgs = route.routeClientBundlePath
                ? `${JSON.stringify(cached.slowViewState)}, ${JSON.stringify(fastViewState)}, ${JSON.stringify(fastCarryForward)}, ${JSON.stringify(clientInitData)}`
                : `${JSON.stringify(fastViewState)}, ${JSON.stringify(fastCarryForward)}, ${JSON.stringify(clientInitData)}`;
            write(`
    <script type="module">
      import { init } from '${clientBundleUrl}';
      await init(${initArgs});
    </script>
  </body>
</html>`);
            controller.close();

            const total = Date.now() - t0;
            const parts = [
                `data: ${tData - t0}ms`,
                `fast: ${tFast - tData}ms`,
                `ssr: ${tSsr - tSsrStart}ms`,
            ];
            console.log(`GET ${match.pathname} [${parts.join(' | ')}] ${total}ms`);
        },
    });

    const responseHeaders = (fastResult as any).responseHeaders || {};
    return new Response(stream, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...responseHeaders },
    });
}
