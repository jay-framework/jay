import { describe, it, expect } from 'vitest';
import { generateClientScript } from '../lib/generate-client-script';
import { prettifyHtml } from '@jay-framework/compiler-shared';
import type { DevServerPagePart } from '../lib/load-page-parts';
import type { PluginWithInit } from '../lib/plugin-init-discovery';

/**
 * Helper to format HTML for consistent comparison.
 */
function formatHtml(html: string): string {
    return prettifyHtml(html);
}

describe('generateClientScript', () => {
    const baseJayHtmlPath = '/src/pages/index.jay-html';

    describe('basic HTML structure', () => {
        it('should generate valid HTML with no parts', () => {
            const html = generateClientScript({}, {}, [], baseJayHtmlPath);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should include viewState and fastCarryForward', () => {
            const viewState = { count: 5, name: 'test' };
            const fastCarryForward = { timestamp: 12345 };

            const html = generateClientScript(viewState, fastCarryForward, [], baseJayHtmlPath);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {"count":5,"name":"test"};
                          const fastCarryForward = {"timestamp":12345};
                          const trackByMap = {};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should include trackByMap when provided', () => {
            const trackByMap = { items: 'id' };
            const html = generateClientScript({}, {}, [], baseJayHtmlPath, trackByMap);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {"items":"id"};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });
    });

    describe('page parts', () => {
        it('should generate imports for page parts', () => {
            const parts: DevServerPagePart[] = [
                {
                    clientImport: 'import { ProductCard } from "/src/components/product-card";',
                    clientPart: '{ component: ProductCard, name: "product-card" }',
                },
            ];

            const html = generateClientScript({}, {}, parts, baseJayHtmlPath);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          import { ProductCard } from "/src/components/product-card";

                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
        { component: ProductCard, name: "product-card" }
        ], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should generate multiple imports for multiple parts', () => {
            const parts: DevServerPagePart[] = [
                {
                    clientImport: 'import { ProductCard } from "/src/components/product-card";',
                    clientPart: '{ component: ProductCard, name: "product-card" }',
                },
                {
                    clientImport: 'import { CartButton } from "/src/components/cart-button";',
                    clientPart: '{ component: CartButton, name: "cart-button" }',
                },
            ];

            const html = generateClientScript({}, {}, parts, baseJayHtmlPath);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          import { ProductCard } from "/src/components/product-card";
import { CartButton } from "/src/components/cart-button";

                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
        { component: ProductCard, name: "product-card" },
        { component: CartButton, name: "cart-button" }
        ], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });
    });

    describe('client init data', () => {
        it('should not include client init when no data provided', () => {
            const html = generateClientScript({}, {}, [], baseJayHtmlPath);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should include runClientInit and embed namespaced client init data', () => {
            const clientInitData = {
                project: { itemsPerPage: 20 },
                'wix-stores': { currency: 'USD' },
            };

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, clientInitData);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      
      
      // Client initialization (static config from server)
      const clientInitData = {"project":{"itemsPerPage":20},"wix-stores":{"currency":"USD"}};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should include client init file import when path provided', () => {
            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                {},
                {},
                '/src/jay.client-init.ts',
            );

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          
                          import { render } from '/src/pages/index.jay-html';
                          import "/src/jay.client-init.ts";
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });
    });

    describe('plugin client init', () => {
        const createPluginWithInit = (
            name: string,
            clientInitExport: string = 'clientInit',
            isLocal: boolean = false,
        ): PluginWithInit => ({
            name,
            pluginPath: `/src/plugins/${name}`,
            packageName: `@wix/${name}`,
            isLocal,
            serverInit: null,
            clientInit: { export: clientInitExport, module: './init/client' },
        });

        it('should import and call NPM plugin client init with plugin name', () => {
            const plugins: PluginWithInit[] = [createPluginWithInit('wix-stores')];

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, plugins);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "@wix/wix-stores/client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "wix-stores" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should import local plugin client init from lib/index.client', () => {
            const plugins: PluginWithInit[] = [createPluginWithInit('local-plugin', 'clientInit', true)];

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, plugins);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "/src/plugins/local-plugin/lib/index.client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "local-plugin" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should support custom export names for plugin init', () => {
            const plugins: PluginWithInit[] = [createPluginWithInit('auth-plugin', 'initAuthClient')];

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, plugins);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { initAuthClient as pluginClientInit0 } from "@wix/auth-plugin/client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "auth-plugin" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should import and call multiple plugins in dependency order', () => {
            const plugins: PluginWithInit[] = [
                createPluginWithInit('wix-auth'),
                createPluginWithInit('wix-stores'),
                createPluginWithInit('wix-payments'),
            ];

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, plugins);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "@wix/wix-auth/client";
      import { clientInit as pluginClientInit1 } from "@wix/wix-stores/client";
      import { clientInit as pluginClientInit2 } from "@wix/wix-payments/client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "wix-auth" });
      pluginClientInit1({ pluginName: "wix-stores" });
      pluginClientInit2({ pluginName: "wix-payments" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should skip plugins without client init', () => {
            const plugins: PluginWithInit[] = [
                {
                    name: 'server-only-plugin',
                    pluginPath: '/src/plugins/server-only',
                    packageName: '@wix/server-only',
                    isLocal: false,
                    serverInit: { export: 'serverInit', module: './init/server' },
                    clientInit: null, // No client init
                },
                createPluginWithInit('wix-stores'),
            ];

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, plugins);

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "@wix/wix-stores/client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "wix-stores" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });

        it('should only include plugins that are passed (filtering happens in dev-server)', () => {
            // This tests that generateClientScript correctly renders only the plugins it receives
            // The dev-server is responsible for filtering based on usedPackages
            const allPlugins: PluginWithInit[] = [
                createPluginWithInit('wix-auth'),
                createPluginWithInit('wix-stores'),
                createPluginWithInit('wix-payments'),
            ];

            // Simulate dev-server filtering: only wix-stores is used on this page
            const pluginsForPage = allPlugins.filter((p) => p.name === 'wix-stores');

            const html = generateClientScript({}, {}, [], baseJayHtmlPath, {}, {}, undefined, pluginsForPage);

            // Should only include wix-stores, not wix-auth or wix-payments
            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "@wix/wix-stores/client";
                          import { render } from '/src/pages/index.jay-html';
                          
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "wix-stores" });
      
      // Client initialization (static config from server)
      const clientInitData = {};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });
    });

    describe('full integration', () => {
        it('should generate complete page with all features', () => {
            const viewState = { productId: 'prod-123' };
            const fastCarryForward = { userId: 'user-456' };
            const parts: DevServerPagePart[] = [
                {
                    clientImport: 'import { ProductCard } from "/src/components/product-card";',
                    clientPart: '{ component: ProductCard, name: "product-card" }',
                },
            ];
            const trackByMap = { products: 'id' };
            const clientInitData = {
                project: { theme: 'dark' },
                'wix-stores': { currency: 'EUR' },
            };
            const clientInitFilePath = '/src/jay.client-init.ts';
            const plugins: PluginWithInit[] = [
                {
                    name: 'wix-stores',
                    pluginPath: '/src/plugins/wix-stores',
                    packageName: '@wix/stores',
                    isLocal: false,
                    serverInit: null,
                    clientInit: { export: 'clientInit', module: './init/client' },
                },
            ];

            const html = generateClientScript(
                viewState,
                fastCarryForward,
                parts,
                baseJayHtmlPath,
                trackByMap,
                clientInitData,
                clientInitFilePath,
                plugins,
            );

            expect(formatHtml(html)).toEqual(
                formatHtml(`
                    <!doctype html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                        <title>Vite + TS</title>
                      </head>
                      <body>
                        <div id="target"></div>
                        <script type="module">
                          import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
                          import { runClientInit } from "@jay-framework/stack-client-runtime";
                          import { clientInit as pluginClientInit0 } from "@wix/stores/client";
                          import { render } from '/src/pages/index.jay-html';
                          import "/src/jay.client-init.ts";
                          import { ProductCard } from "/src/components/product-card";

                          const viewState = {"productId":"prod-123"};
                          const fastCarryForward = {"userId":"user-456"};
                          const trackByMap = {"products":"id"};

      // Plugin client initialization (in dependency order)
      pluginClientInit0({ pluginName: "wix-stores" });
      
      // Client initialization (static config from server)
      const clientInitData = {"project":{"theme":"dark"},"wix-stores":{"currency":"EUR"}};
      await runClientInit(clientInitData);

                          const target = document.getElementById('target');
                          const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
        { component: ProductCard, name: "product-card" }
        ], trackByMap)

                          const instance = pageComp({...viewState, ...fastCarryForward})
                          target.appendChild(instance.element.dom);
                        </script>
                      </body>
                    </html>
                `),
            );
        });
    });
});
