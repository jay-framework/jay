import { describe, it, expect } from 'vitest';
import { generateClientScript, ProjectClientInitInfo } from '../lib/generate-client-script';
import { prettifyHtml } from '@jay-framework/compiler-shared';
import type { DevServerPagePart } from '../lib/load-page-parts';
import type { PluginClientInitInfo } from '../lib/plugin-init-discovery';

/**
 * Helper to format HTML for consistent comparison.
 */
function formatHtml(html: string): string {
    return prettifyHtml(html);
}

/**
 * Helper to create a minimal DevServerPagePart for testing.
 * Only clientImport and clientPart are used by generateClientScript.
 */
function createPagePart(clientImport: string, clientPart: string): DevServerPagePart {
    return {
        compDefinition: {} as any, // Not used by generateClientScript
        clientImport,
        clientPart,
    };
}

/**
 * Helper to create a PluginClientInitInfo for testing.
 */
function createPluginInitInfo(
    name: string,
    importPath: string,
    initExport: string = 'init',
): PluginClientInitInfo {
    return { name, importPath, initExport };
}

describe('generateClientScript', () => {
    const baseJayHtmlPath = '/src/pages/index.jay-html';
    // Disable automation for these tests to focus on core functionality
    const noAutomation = { enableAutomation: false };

    describe('basic HTML structure', () => {
        it('should generate valid HTML with no parts', () => {
            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                {},
                {},
                undefined,
                [],
                noAutomation,
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

            const html = generateClientScript(
                viewState,
                fastCarryForward,
                [],
                baseJayHtmlPath,
                {},
                {},
                undefined,
                [],
                noAutomation,
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
            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                trackByMap,
                {},
                undefined,
                [],
                noAutomation,
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
                createPagePart(
                    'import { ProductCard } from "/src/components/product-card";',
                    '{ component: ProductCard, name: "product-card" }',
                ),
            ];

            const html = generateClientScript(
                {},
                {},
                parts,
                baseJayHtmlPath,
                {},
                {},
                undefined,
                [],
                noAutomation,
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
                createPagePart(
                    'import { ProductCard } from "/src/components/product-card";',
                    '{ component: ProductCard, name: "product-card" }',
                ),
                createPagePart(
                    'import { CartButton } from "/src/components/cart-button";',
                    '{ component: CartButton, name: "cart-button" }',
                ),
            ];

            const html = generateClientScript(
                {},
                {},
                parts,
                baseJayHtmlPath,
                {},
                {},
                undefined,
                [],
                noAutomation,
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

    describe('makeJayInit plugin client init', () => {
        it('should import and call plugin JayInit with its serverData', () => {
            const plugins: PluginClientInitInfo[] = [
                createPluginInitInfo('wix-stores', '@wix/wix-stores/lib/init', 'init'),
            ];
            const clientInitData = { 'wix-stores': { currency: 'USD' } };

            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                {},
                clientInitData,
                undefined,
                plugins,
                noAutomation,
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
                          import { init as jayInit0 } from "@wix/wix-stores/lib/init";
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      if (typeof jayInit0._clientInit === 'function') {
        console.log('[DevServer] Running client init: wix-stores');
        await jayInit0._clientInit({"currency":"USD"});
      }
      
      // Project client initialization
      

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
            const plugins: PluginClientInitInfo[] = [
                createPluginInitInfo('wix-auth', '@wix/auth/lib/init', 'init'),
                createPluginInitInfo('wix-stores', '@wix/stores/lib/init', 'storesInit'),
            ];
            const clientInitData = {
                'wix-auth': { clientId: 'abc' },
                'wix-stores': { currency: 'USD' },
            };

            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                {},
                clientInitData,
                undefined,
                plugins,
                noAutomation,
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
                          import { init as jayInit0 } from "@wix/auth/lib/init";
      import { storesInit as jayInit1 } from "@wix/stores/lib/init";
                          
                          import { render } from '/src/pages/index.jay-html';
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

      // Plugin client initialization (in dependency order)
      if (typeof jayInit0._clientInit === 'function') {
        console.log('[DevServer] Running client init: wix-auth');
        await jayInit0._clientInit({"clientId":"abc"});
      }
      if (typeof jayInit1._clientInit === 'function') {
        console.log('[DevServer] Running client init: wix-stores');
        await jayInit1._clientInit({"currency":"USD"});
      }
      
      // Project client initialization
      

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

    describe('project init (makeJayInit pattern)', () => {
        it('should import and call project JayInit', () => {
            const projectInit: ProjectClientInitInfo = {
                importPath: '/src/lib/init',
                initExport: 'init',
            };
            const clientInitData = { project: { theme: 'dark' } };

            const html = generateClientScript(
                {},
                {},
                [],
                baseJayHtmlPath,
                {},
                clientInitData,
                projectInit,
                [],
                noAutomation,
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
                          
                          import { init as projectJayInit } from "/src/lib/init";
                          import { render } from '/src/pages/index.jay-html';
                          
                          const viewState = {};
                          const fastCarryForward = {};
                          const trackByMap = {};

                          // Plugin client initialization (in dependency order)
                          
                          
                          // Project client initialization
                          if (typeof projectJayInit._clientInit === 'function') {
                            console.log('[DevServer] Running client init: project');
                            const projectData = {"theme":"dark"};
                            await projectJayInit._clientInit(projectData);
                          }

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
        it('should generate complete page with plugins and project init', () => {
            const viewState = { productId: 'prod-123' };
            const fastCarryForward = { userId: 'user-456' };
            const parts: DevServerPagePart[] = [
                createPagePart(
                    'import { ProductCard } from "/src/components/product-card";',
                    '{ component: ProductCard, name: "product-card" }',
                ),
            ];
            const trackByMap = { products: 'id' };
            const clientInitData = {
                project: { theme: 'dark' },
                'wix-stores': { currency: 'EUR' },
            };
            const projectInit: ProjectClientInitInfo = {
                importPath: '/src/lib/init',
                initExport: 'init',
            };
            const plugins: PluginClientInitInfo[] = [
                createPluginInitInfo('wix-stores', '@wix/stores/lib/init', 'init'),
            ];

            const html = generateClientScript(
                viewState,
                fastCarryForward,
                parts,
                baseJayHtmlPath,
                trackByMap,
                clientInitData,
                projectInit,
                plugins,
                noAutomation,
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
                          import { init as jayInit0 } from "@wix/stores/lib/init";
                          import { init as projectJayInit } from "/src/lib/init";
                          import { render } from '/src/pages/index.jay-html';
                          import { ProductCard } from "/src/components/product-card";

                          const viewState = {"productId":"prod-123"};
                          const fastCarryForward = {"userId":"user-456"};
                          const trackByMap = {"products":"id"};

                          // Plugin client initialization (in dependency order)
                          if (typeof jayInit0._clientInit === 'function') {
                            console.log('[DevServer] Running client init: wix-stores');
                            await jayInit0._clientInit({"currency":"EUR"});
                          }
                          
                          // Project client initialization
                          if (typeof projectJayInit._clientInit === 'function') {
                            console.log('[DevServer] Running client init: project');
                            const projectData = {"theme":"dark"};
                            await projectJayInit._clientInit(projectData);
                          }

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
