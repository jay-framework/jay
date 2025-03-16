import fs from 'node:fs/promises'
import express from 'express'
import {routeToExpressRoute, scanRoutes} from 'jay-stack-route-scanner'
import {jayRuntime} from 'vite-plugin-jay';
import {DevSlowlyChangingPhase, renderFastChangingData} from "jay-stack-runtime";
import path from 'node:path'

// Constants
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Cached production assets
const templateHtml = isProduction
    ? await fs.readFile('./dist/client/index.html', 'utf-8')
    : ''

const jayOptions = {
  tsConfigFilePath: './tsconfig.json',
  outputDir: 'build/jay-runtime',
};


// Create http server
const app = express()

async function initRoutes() {
  return await scanRoutes('./src/pages', {
    jayHtmlFilename: 'page.jay-html',
    compFilename: 'page.ts'
  });
}

async function initApp() {
// Add Vite or respective production middlewares
  /** @type {import('vite').ViteDevServer | undefined} */
  let vite
  if (!isProduction) {
    const { createServer } = await import('vite')
    vite = await createServer({
      server: { middlewareMode: true },
      plugins: [jayRuntime(jayOptions)],
      appType: 'custom',
      base,
    })
    app.use(vite.middlewares)
  } else {
    const compression = (await import('compression')).default
    const sirv = (await import('sirv')).default
    app.use(compression())
    app.use(base, sirv('./dist/client', { extensions: [] }))
  }

// Serve HTML
  const routes = await initRoutes();
  const slowlyPhase = new DevSlowlyChangingPhase();

  routes.forEach(route => {
    app.get(routeToExpressRoute(route), async (req, res) => {
      try {
        const url = req.  originalUrl.replace(base, '')
        const params = req.params;
        const pageProps = {language: 'en'};

        /** @type {string} */
        let template
        /** @type {object} */
        let viewState, carryForward
        if (!isProduction) {
          // Always read fresh template in development
          template = await fs.readFile('./index.html', 'utf-8')
          console.log(url, route);

          const pageComponent = (await vite.ssrLoadModule(route.compPath)).page

          const renderedSlowly = await slowlyPhase.runSlowlyForPage(pageComponent, params, pageProps)

          if (renderedSlowly.kind === "PartialRender") {
            const renderedFast = await renderFastChangingData(pageComponent, params, pageProps, renderedSlowly.carryForward)
            if (renderedFast.kind === "PartialRender") {
              viewState = {...renderedSlowly.render, ...renderedFast.render}
              carryForward = renderedFast.carryForward
            }
            console.log(renderedSlowly, renderedFast);
          }
          else if (renderedSlowly.kind === "ClientError") {
            console.warn('client error', renderedSlowly.status)
          }

          const relativePageComponentPath = path.resolve(base, route.compPath)
          const appScript = `
import {page} from '/src/pages${route.rawRoute}/page.ts';
const viewState = ${JSON.stringify(viewState)}
const carryForward = ${JSON.stringify(carryForward)}
        `

          template = template
              // .replace(`<!--app-head-->`, rendered.head ?? '')
              .replace(`<!--app-script-->`, appScript ?? '')
          template = await vite.transformIndexHtml((!!url)? url : '/', template)

          res.status(200).set({ 'Content-Type': 'text/html' }).send(template)
          return;

        } else {
          template = templateHtml
          // render = (await import('./dist/server/entry-server.js')).render
        }

        res.status(200).set({ 'Content-Type': 'text/html' }).send('not implemented yet')
      } catch (e) {
        vite?.ssrFixStacktrace(e)
        console.log(e.stack)
        res.status(500).end(e.stack)
      }
    })
  })


// Start http server
  app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`)
  })

}

initApp();
