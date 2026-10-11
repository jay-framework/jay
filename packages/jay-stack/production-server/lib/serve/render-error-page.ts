import type { RouteManifest, ErrorPageEntry } from '../types';
import type { ArtifactStore } from './artifact-store';
import {
    mergeHeadTags,
    serializeHeadTags,
    serializeScripts,
    headMetaToHeadTags,
    getClientInitData,
    buildErrorViewState,
    resolveErrorPageToken,
    type ErrorInfo,
} from '@jay-framework/stack-server-runtime';
import type { HeadTag } from '@jay-framework/fullstack-component';
import { asyncSwapScript } from '@jay-framework/ssr-runtime';
import { buildImportMap } from './import-map';
import { getLogger } from '@jay-framework/logger';

/**
 * Render a designed error page for a 4xx/5xx outcome (DL#218). Resolves the page by status
 * (exact → family) from `manifest.errorPages`; when none matches — or when rendering throws —
 * falls back to the built-in plain-text response. The response always carries `info.status`.
 *
 * Error pages are a pass-through: no fast render runs; the framework injects the `error` ViewState
 * (`buildErrorViewState`). Interactivity (hydration) still works via the compiled client bundle.
 */
export async function renderErrorPage(
    manifest: RouteManifest,
    artifacts: ArtifactStore,
    staticBaseUrl: string,
    info: ErrorInfo,
): Promise<Response> {
    const plainText = () =>
        new Response(info.message || info.title || 'Error', {
            status: info.status,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });

    const errorPages = manifest.errorPages;
    if (!errorPages) return plainText();
    const token = resolveErrorPageToken(Object.keys(errorPages), info.status);
    if (!token) return plainText();
    const entry = errorPages[token];

    try {
        return await streamErrorPage(entry, manifest, artifacts, staticBaseUrl, info);
    } catch (err: any) {
        getLogger().error(
            `[Server] Error page "${token}" render failed (${info.status} ${info.url}): ${err?.message}`,
        );
        return plainText();
    }
}

async function streamErrorPage(
    entry: ErrorPageEntry,
    manifest: RouteManifest,
    artifacts: ArtifactStore,
    staticBaseUrl: string,
    info: ErrorInfo,
): Promise<Response> {
    const slowViewState = entry.slowCache?.slowViewState ?? {};
    const fullViewState = buildErrorViewState(info, slowViewState);

    // Head tags: site identity (DL#213) then the error template's <head> resolved against error VS.
    const headTagSources: HeadTag[][] = [];
    if (manifest.siteHeadTags && manifest.siteHeadTags.length > 0)
        headTagSources.push(manifest.siteHeadTags);
    const templateHeadTags = headMetaToHeadTags(entry.headMeta, fullViewState);
    const headTags =
        headTagSources.length > 0 || templateHeadTags.length > 0
            ? mergeHeadTags(headTagSources, templateHeadTags)
            : [];
    const hasCustomTitle = headTags.some((t) => t.tag?.toLowerCase() === 'title');
    const titleTag = hasCustomTitle ? '' : `    <title>${info.status} Error</title>\n`;
    const preconnectTags = headTags.filter(
        (t) => t.tag === 'link' && t.attrs?.rel === 'preconnect',
    );
    const otherHeadTags = headTags.filter(
        (t) => !(t.tag === 'link' && t.attrs?.rel === 'preconnect'),
    );
    const preconnectHtml =
        preconnectTags.length > 0 ? serializeHeadTags(preconnectTags) + '\n' : '';
    const headTagsHtml = otherHeadTags.length > 0 ? serializeHeadTags(otherHeadTags) + '\n' : '';

    const headScriptsHtml = serializeScripts(entry.scripts, 'head');
    const bodyScriptsHtml = serializeScripts(entry.scripts, 'body');

    const serverElement = await artifacts.loadServerElement(entry.serverElementPath);
    const asyncPromises: Promise<string>[] = [];

    const importMap = buildImportMap(manifest.sharedManifest, staticBaseUrl);
    if (entry.routeHydratePath) {
        importMap['jay-route-hydrate'] = `${staticBaseUrl}${entry.routeHydratePath}`;
    }
    const clientBundleUrl = entry.routeClientBundlePath
        ? `${staticBaseUrl}${entry.routeClientBundlePath}`
        : '';
    const sharedPreloads = entry.sharedDeps
        ? entry.sharedDeps.map((dep) => importMap[dep]).filter(Boolean)
        : Object.values(importMap);
    const preloadUrls = clientBundleUrl ? [...sharedPreloads, clientBundleUrl] : [];
    const modulePreloads = preloadUrls
        .map((url) => `    <link rel="modulepreload" href="${url}" />`)
        .join('\n');
    const cssUrl = entry.routeCssPath ? `${staticBaseUrl}${entry.routeCssPath}` : '';
    const cssPreload = cssUrl ? `    <link rel="preload" href="${cssUrl}" as="style" />` : '';
    const cssLink = cssUrl ? `    <link rel="stylesheet" href="${cssUrl}" />` : '';
    const cssImportPreloads = (entry.cssImports ?? [])
        .map((url) => `    <link rel="preload" href="${url}" as="style" />`)
        .join('\n');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const write = (s: string) => controller.enqueue(encoder.encode(s));

            const headParts = [headTagsHtml, modulePreloads, cssLink, headScriptsHtml]
                .filter(Boolean)
                .join('\n');
            write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${titleTag}${[preconnectHtml, cssPreload, cssImportPreloads]
                .filter(Boolean)
                .map((l) => l + '\n')
                .join(
                    '',
                )}    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
${headParts}
  </head>
  <body>
    <div id="target">`);

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

            write('</div>');

            const asyncScripts = (await Promise.all(asyncPromises)).filter((s) => s).join('');
            if (asyncScripts) write(asyncScripts);

            // An error page has no fast/slow split — the whole error VS hydrates as fastViewState.
            if (clientBundleUrl) {
                const clientInitData = getClientInitData();
                const initArgs = `${JSON.stringify({})}, ${JSON.stringify(fullViewState)}, ${JSON.stringify({})}, ${JSON.stringify(clientInitData)}`;
                write(`
    <script type="module">
      import { init } from '${clientBundleUrl}';
      await init(${initArgs});
    </script>`);
            }
            if (bodyScriptsHtml) write('\n    ' + bodyScriptsHtml);
            write(`
  </body>
</html>`);
            controller.close();
        },
    });

    return new Response(stream, {
        status: info.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
