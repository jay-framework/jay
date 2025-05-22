import {Connect, ViteDevServer} from 'vite';
import {JayRoute, JayRoutes, Route, routeToExpressRoute, scanRoutes} from 'jay-stack-route-scanner';
import {DevSlowlyChangingPhase, SlowlyChangingPhase} from './slowly-changing-runner';
import type { PageProps, AnyJayStackComponentDefinition, PartialRender } from './jay-stack-types';
import { CompositePart, MAIN_PART } from './composite-part';
import fs from 'node:fs/promises';
import { createServer} from 'vite';
import {JayRollupConfig, jayRuntime} from "vite-plugin-jay";
import Server = Connect.Server;
import path from "node:path";
import {RequestHandler} from "express-serve-static-core";
import {renderFastChangingData} from "../dist";
import {JAY_IMPORT_RESOLVER, parseJayFile} from "jay-compiler-jay-html";
import {WithValidations} from "jay-compiler-shared";

export interface DevServerOptions {
    serverBase?: string;
    pagesBase?: string;
    jayRollupConfig: JayRollupConfig;
    dontCacheSlowly: boolean;
}

async function initRoutes(pagesBaseFolder: string): Promise<JayRoutes> {
    return await scanRoutes(pagesBaseFolder, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });
}

function defaults(options: DevServerOptions): DevServerOptions {
    const serverBase = options.serverBase || process.env.BASE || '/'
    const pagesBase = path.resolve(serverBase, options.pagesBase || './src/pages');
    const tsConfigFilePath = options.jayRollupConfig.tsConfigFilePath || path.resolve(serverBase, './tsconfig.json')
    return {
        serverBase,
        pagesBase,
        dontCacheSlowly: options.dontCacheSlowly,
        jayRollupConfig: {
            ...(options.jayRollupConfig || {}),
            tsConfigFilePath
        }
    }
}


export interface DevServerRoute {
    path: string,
    handler: RequestHandler
}

export interface DevServer {
    server: Server;
    viteServer: ViteDevServer;
    routes: DevServerRoute[]
}

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    <div id="target"></div>
    <script type="module">
      import {makeJayComponent} from 'jay-component';
      import {makeCompositeJayComponent} from "jay-stack-runtime";
      <!--app-script-->

      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(page.render, viewState, [
        {comp: page.comp, contextMarkers: [], viewStateKey: 'a'}
      ])
      // const pageComp = makeJayComponent(page.render, page.comp);

      const instance = pageComp({...viewState, ...carryForward})
      target.appendChild(instance.element.dom);
    </script>
  </body>
</html>`

async function loadPageParts(vite: ViteDevServer, route: JayRoute, options: DevServerOptions): Promise<WithValidations<CompositePart[]>> {
    const exists = await fs.access(route.compPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);

    const parts: CompositePart[] = [];
    if (exists) {
        const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
        parts.push({
            compDefinition: pageComponent,
            key: MAIN_PART
        })
    }

    const jayHtmlSource = (await fs.readFile(route.jayHtmlPath)).toString();
    const fileName = path.basename(route.jayHtmlPath);
    const dirName = path.dirname(route.jayHtmlPath);
    const jayHtmlWithValidations = await parseJayFile(jayHtmlSource, fileName, dirName, {
        relativePath: options.jayRollupConfig.tsConfigFilePath
    }, JAY_IMPORT_RESOLVER)

    return jayHtmlWithValidations.mapAsync(async jayHtml => {
        for await (const headlessImport of jayHtml.headlessImports) {
            const modulePath = path.resolve(dirName, headlessImport.importLink.module)
            const pageComponent = (await vite.ssrLoadModule(modulePath)).page;
            const part: CompositePart = {
                key: headlessImport.key,
                compDefinition: pageComponent
            }
            parts.push(part)
        }
        return parts;
    })
}

function mkRoute(route: JayRoute,
                 vite: ViteDevServer,
                 slowlyPhase: SlowlyChangingPhase,
                 options: DevServerOptions): DevServerRoute {
    const path = routeToExpressRoute(route);
    const handler = async (req, res) => {
        try {
            const url = req.originalUrl.replace(options.serverBase, '');
            const pageParams = req.params;
            const pageProps: PageProps = {
                language: 'en',
                url
            };

            /** @type {string} */
            let template = PAGE_HTML;
            /** @type {object} */
            let viewState, carryForward;
            // Always read fresh template in development

            const pageParts = await loadPageParts(vite, route, options);

            if (pageParts.val) {
                const renderedSlowly = await slowlyPhase.runSlowlyForPage(
                    pageParams,
                    pageProps,
                    pageParts.val,
                );

                if (renderedSlowly.kind === 'PartialRender') {
                    const renderedFast = await renderFastChangingData(
                        pageParams,
                        pageProps,
                        renderedSlowly.carryForward,
                        pageParts.val
                    );
                    if (renderedFast.kind === 'PartialRender') {
                        viewState = {...renderedSlowly.rendered, ...renderedFast.rendered};
                        carryForward = renderedFast.carryForward;
                    }
                    console.log(renderedSlowly, renderedFast);
                } else if (renderedSlowly.kind === 'ClientError') {
                    console.warn('client error', renderedSlowly.status);
                }

                const appScript = `
// import {page} from '/src/pages${route.rawRoute}/page.ts';
const viewState = ${JSON.stringify(viewState)}
const carryForward = ${JSON.stringify(carryForward)}
        `;

                template = template.replace(`<!--app-script-->`, appScript ?? '');
                template = await vite.transformIndexHtml(!!url ? url : '/', template);

                res.status(200).set({'Content-Type': 'text/html'}).send(template);
            }
            else {
                console.log(pageParts.validations.join('\n'));
                res.status(500).end(pageParts.validations.join('\n'));
            }
        } catch (e) {
            vite?.ssrFixStacktrace(e);
            console.log(e.stack);
            res.status(500).end(e.stack);
        }
    }
    return {path, handler}
}

export async function mkDevServer(options: DevServerOptions): Promise<DevServer> {
    const {serverBase, pagesBase, jayRollupConfig, dontCacheSlowly} = defaults(options);
    const vite = await createServer({
        server: { middlewareMode: true },
        plugins: [jayRuntime(jayRollupConfig)],
        appType: 'custom',
        base: serverBase,
    });

    const routes: JayRoutes = await initRoutes(pagesBase);
    const slowlyPhase = new DevSlowlyChangingPhase(dontCacheSlowly);

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(route, vite, slowlyPhase, options))

    return {
        server: vite.middlewares,
        viteServer: vite,
        routes: devServerRoutes
    };
}

