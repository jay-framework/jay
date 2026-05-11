import type { ServerResponse } from 'node:http';
import type { RouteManifest } from '../types';
import type { MatchResult } from './route-matcher';
import type { FilesystemArtifactStore } from './artifact-store';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { asyncSwapScript, type ServerRenderContext } from '@jay-framework/ssr-runtime';
import { buildImportMap } from './import-map';

export async function handlePageRequest(
    res: ServerResponse,
    match: MatchResult,
    manifest: RouteManifest,
    artifacts: FilesystemArtifactStore,
): Promise<void> {
    const { route, instance } = match;

    const preRendered = await artifacts.readPreRenderedHtml(instance.preRenderedPath);

    const pageModule = await artifacts.loadPageModule(route.serverModule);
    const compDefinition = pageModule.page ?? pageModule.default;

    let fastViewState: object = {};
    let fastCarryForward: object = {};

    if (compDefinition?.fastRender) {
        const { resolveServices } = await import('@jay-framework/stack-server-runtime');
        const services = resolveServices(compDefinition.services || []);
        const fastResult = compDefinition.slowlyRender
            ? await compDefinition.fastRender(
                  { params: match.params },
                  preRendered.carryForward,
                  ...services,
              )
            : await compDefinition.fastRender(
                  { params: match.params },
                  ...services,
              );

        if (fastResult.kind === 'Redirect3xx') {
            res.writeHead(fastResult.status, { Location: fastResult.location });
            res.end();
            return;
        }
        if (fastResult.kind === 'ServerError5xx' || fastResult.kind === 'ClientError4xx') {
            res.writeHead(fastResult.status);
            res.end(fastResult.message || 'Error');
            return;
        }
        if (fastResult.kind === 'PhaseOutput') {
            fastViewState = fastResult.rendered;
            fastCarryForward = fastResult.carryForward;
        }
    }

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
