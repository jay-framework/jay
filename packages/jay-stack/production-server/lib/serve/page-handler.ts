import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { RouteManifest } from '../types';
import type { MatchResult } from './route-matcher';
import type { FilesystemArtifactStore } from './artifact-store';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import type { DevServerPagePart, HeadlessInstanceComponent } from '@jay-framework/stack-server-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { asyncSwapScript } from '@jay-framework/ssr-runtime';
import { buildImportMap } from './import-map';
import { loadProductionPageParts, type ProductionPageParts } from '../builder/load-production-parts';
import type { RouteEntry } from '../types';

const pagePartsCache = new Map<string, ProductionPageParts>();

async function getPageParts(
    route: RouteEntry,
    pageModule: any,
    artifacts: FilesystemArtifactStore,
    preRenderedPath: string,
    manifest: RouteManifest,
): Promise<ProductionPageParts> {
    const cacheKey = route.pattern;
    const cached = pagePartsCache.get(cacheKey);
    if (cached) return cached;

    if (!route.jayHtmlPath) {
        return { parts: [{ compDefinition: pageModule.page ?? pageModule.default, clientImport: '', clientPart: '' }],
            headlessContracts: [], headlessInstanceComponents: [], discoveredInstances: [], forEachInstances: [], keyedPartModules: [] };
    }

    const jayHtmlContent = await artifacts.readRawFile(preRenderedPath);
    const serverBuildDir = artifacts.getAssetPath('server');
    const parts = await loadProductionPageParts(
        { jayHtmlPath: route.jayHtmlPath },
        pageModule,
        jayHtmlContent,
        manifest.projectRoot,
        undefined,
        serverBuildDir,
    );
    pagePartsCache.set(cacheKey, parts);
    return parts;
}

export async function handlePageRequest(
    res: ServerResponse,
    match: MatchResult,
    manifest: RouteManifest,
    artifacts: FilesystemArtifactStore,
): Promise<void> {
    const { route, instance } = match;

    const preRendered = await artifacts.readPreRenderedHtml(instance.preRenderedPath);
    const pageModule = await artifacts.loadPageModule(route.serverModule);

    const pageParts = await getPageParts(
        route,
        pageModule,
        artifacts,
        instance.preRenderedPath,
        manifest,
    );

    const url = new URL(`http://localhost${match.pathname}`);
    const query = Object.fromEntries(url.searchParams.entries());

    const fastResult = await renderFastChangingData(
        match.params,
        { params: match.params, query },
        preRendered.carryForward,
        pageParts.parts,
        (preRendered.carryForward as any).__instances,
        pageParts.forEachInstances,
        pageParts.headlessInstanceComponents,
        preRendered.slowViewState,
        query,
    );

    if (fastResult.kind === 'Redirect3xx') {
        res.writeHead((fastResult as any).status, { Location: (fastResult as any).location });
        res.end();
        return;
    }
    if (fastResult.kind === 'ServerError5xx' || fastResult.kind === 'ClientError4xx') {
        res.writeHead((fastResult as any).status);
        res.end((fastResult as any).message || 'Error');
        return;
    }

    const fastViewState = (fastResult as any).rendered || {};
    const fastCarryForward = (fastResult as any).carryForward || {};

    const fullViewState = deepMergeViewStates(
        preRendered.slowViewState,
        fastViewState,
        route.trackByMap || {},
    );

    const serverElement = await artifacts.loadServerElement(instance.serverElementPath);
    const asyncPromises: Promise<string>[] = [];

    const importMap = buildImportMap(manifest.sharedManifest, manifest.publicBasePath);
    const cssLink = instance.clientCssPath
        ? `    <link rel="stylesheet" href="${manifest.publicBasePath}${instance.clientCssPath}" />\n`
        : '';

    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Transfer-Encoding': 'chunked',
    });

    res.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${cssLink}    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
  </head>
  <body>
    <div id="target">`);

    serverElement.renderToStream(fullViewState, {
        write: (chunk: string) => res.write(chunk),
        onAsync: (promise, id, templates) => {
            asyncPromises.push(
                promise.then(
                    (val) => asyncSwapScript(id, templates.resolved(val)),
                    (err) => asyncSwapScript(id, templates.rejected(err)),
                ),
            );
        },
    });

    res.write('</div>');

    const asyncScripts = (await Promise.all(asyncPromises)).filter((s) => s).join('');
    if (asyncScripts) res.write(asyncScripts);

    const clientBundleUrl = `${manifest.publicBasePath}${instance.clientBundlePath}`;
    res.write(`
    <script type="module">
      import { init } from '${clientBundleUrl}';
      init(${JSON.stringify(fastViewState)}, ${JSON.stringify(fastCarryForward)});
    </script>
  </body>
</html>`);
    res.end();
}
