import {
    parseJayFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors, JAY_QUERY_HYDRATE } from '@jay-framework/compiler-shared';
import type { ServerRenderContext } from '@jay-framework/ssr-runtime';
import type { ViteDevServer } from 'vite';
import type { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';
import type { ProjectClientInitInfo, GenerateClientScriptOptions } from './generate-client-script';
import type { PluginClientInitInfo } from './plugin-init-discovery';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';

/**
 * Generate a complete SSR HTML page with server-rendered content and hydration script.
 *
 * Flow:
 * 1. Parse jay-html → generate server element code
 * 2. Write server element to build folder, load via vite.ssrLoadModule()
 * 3. Execute renderToStream() to produce HTML
 * 4. Build hydration script (uses ?jay-hydrate query for hydrate target)
 * 5. Return full HTML page string
 */
export async function generateSSRPageHtml(
    vite: ViteDevServer,
    jayHtmlContent: string,
    jayHtmlFilename: string,
    jayHtmlDir: string,
    viewState: object,
    jayHtmlImportPath: string,
    parts: DevServerPagePart[],
    carryForward: object,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, Record<string, any>> = {},
    buildFolder: string,
    projectRoot: string,
    tsConfigFilePath?: string,
    projectInit?: ProjectClientInitInfo,
    pluginInits: PluginClientInitInfo[] = [],
    options: GenerateClientScriptOptions = {},
): Promise<string> {
    // Step 1: Parse jay-html and generate server element code
    const jayFile = await parseJayFile(
        jayHtmlContent,
        jayHtmlFilename,
        jayHtmlDir,
        { relativePath: tsConfigFilePath },
        JAY_IMPORT_RESOLVER,
        projectRoot,
    );
    const parsedJayFile = checkValidationErrors(jayFile);
    const serverElementCode = checkValidationErrors(generateServerElementFile(parsedJayFile));

    // Step 2: Write to build folder and load via Vite SSR
    const serverElementsDir = path.join(buildFolder, 'server-elements');
    await fs.mkdir(serverElementsDir, { recursive: true });

    const serverElementFilename = jayHtmlFilename.replace('.jay-html', '.server-element.ts');
    const serverElementPath = path.join(serverElementsDir, serverElementFilename);
    await fs.writeFile(serverElementPath, serverElementCode, 'utf-8');

    const serverModule = await vite.ssrLoadModule(serverElementPath);
    const renderToStream = serverModule.renderToStream as (
        vs: object,
        ctx: ServerRenderContext,
    ) => void;

    // Step 3: Render HTML to buffer
    const htmlChunks: string[] = [];
    const asyncPromises: Array<Promise<string>> = [];

    const ctx: ServerRenderContext = {
        write: (chunk: string) => {
            htmlChunks.push(chunk);
        },
        onAsync: (promise, id, templates) => {
            const asyncPromise = promise.then(
                (val) => {
                    if (templates.resolved) {
                        return templates.resolved(val);
                    }
                    return '';
                },
                (err) => {
                    if (templates.rejected) {
                        return templates.rejected(err);
                    }
                    return '';
                },
            );
            asyncPromises.push(asyncPromise);
        },
    };

    renderToStream(viewState, ctx);

    // Wait for all async content to resolve
    // (In buffered mode we wait for everything before sending)
    const asyncResults = await Promise.all(asyncPromises);
    let ssrHtml = htmlChunks.join('');

    // Append async swap scripts for any resolved async content
    const asyncScripts = asyncResults.filter((r) => r !== '').join('');

    // Step 4: Build hydration script
    const hydrationScript = generateHydrationScript(
        viewState,
        carryForward,
        parts,
        jayHtmlImportPath,
        trackByMap,
        clientInitData,
        projectInit,
        pluginInits,
        options,
    );

    // Step 5: Build full HTML page
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    <div id="target">${ssrHtml}</div>${asyncScripts}
    ${hydrationScript}
  </body>
</html>`;
}

/**
 * Generate the hydration script that adopts the server-rendered DOM.
 *
 * Similar to generateClientScript() but:
 * - Imports hydrateCompositeJayComponent instead of makeCompositeJayComponent
 * - Imports hydrate function from ?jay-hydrate target instead of render from element target
 * - Passes rootElement (target.firstElementChild) to hydrateCompositeJayComponent
 * - No target.appendChild — DOM already in place
 */
function generateHydrationScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    jayHtmlPath: string,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, Record<string, any>> = {},
    projectInit?: ProjectClientInitInfo,
    pluginInits: PluginClientInitInfo[] = [],
    options: GenerateClientScriptOptions = {},
): string {
    const { enableAutomation = true, slowViewState } = options;
    const hasSlowViewState = slowViewState && Object.keys(slowViewState).length > 0;

    const imports =
        parts.length > 0 ? parts.map((part) => part.clientImport).join('\n') + '\n' : '';
    const compositeParts =
        parts.length > 0
            ? `[
${parts.map((part) => '        ' + part.clientPart).join(',\n')}
        ]`
            : '[]';

    // Client init imports and execution
    const hasClientInit = projectInit || pluginInits.length > 0;

    const pluginClientInitImports = pluginInits
        .map((plugin, idx) => {
            return `import { ${plugin.initExport} as jayInit${idx} } from "${plugin.importPath}";`;
        })
        .join('\n      ');

    const projectInitImport = projectInit
        ? `import { ${projectInit.initExport || 'init'} as projectJayInit } from "${projectInit.importPath}";`
        : '';

    const pluginClientInitCalls = pluginInits
        .map((plugin, idx) => {
            const pluginData = clientInitData[plugin.name] || {};
            return `if (typeof jayInit${idx}._clientInit === 'function') {
        console.log('[DevServer] Running client init: ${plugin.name}');
        await jayInit${idx}._clientInit(${JSON.stringify(pluginData)});
      }`;
        })
        .join('\n      ');

    const projectInitCall = projectInit
        ? `if (typeof projectJayInit._clientInit === 'function') {
        console.log('[DevServer] Running client init: project');
        const projectData = ${JSON.stringify(clientInitData['project'] || {})};
        await projectJayInit._clientInit(projectData);
      }`
        : '';

    const clientInitExecution = hasClientInit
        ? `
      // Plugin client initialization (in dependency order)
      ${pluginClientInitCalls}

      // Project client initialization
      ${projectInitCall}
`
        : '';

    // Automation integration
    const automationImport = enableAutomation
        ? hasSlowViewState
            ? `import { wrapWithAutomation, AUTOMATION_CONTEXT } from "@jay-framework/runtime-automation";
      import { registerGlobalContext } from "@jay-framework/runtime";
      import { deepMergeViewStates } from "@jay-framework/view-state-merge";`
            : `import { wrapWithAutomation, AUTOMATION_CONTEXT } from "@jay-framework/runtime-automation";
      import { registerGlobalContext } from "@jay-framework/runtime";`
        : '';

    const slowViewStateDecl =
        enableAutomation && hasSlowViewState
            ? `const slowViewState = ${JSON.stringify(slowViewState)};`
            : '';

    // For hydration, automation wraps but doesn't appendChild (DOM already in place)
    const automationWrap = enableAutomation
        ? hasSlowViewState
            ? `
      // Wrap with automation for dev tooling
      const fullViewState = deepMergeViewStates(slowViewState, {...viewState, ...fastCarryForward}, trackByMap);
      const wrapped = wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
      registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
      window.__jay = window.__jay || {};
      window.__jay.automation = wrapped.automation;`
            : `
      // Wrap with automation for dev tooling
      const wrapped = wrapWithAutomation(instance);
      registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
      window.__jay = window.__jay || {};
      window.__jay.automation = wrapped.automation;`
        : '';

    // Build the hydrate import path: append ?jay-hydrate to the jay-html path
    const hydrateImportPath = `${jayHtmlPath}${JAY_QUERY_HYDRATE}`;

    return `<script type="module">
      import {hydrateCompositeJayComponent} from "@jay-framework/stack-client-runtime";
      ${automationImport}
      ${pluginClientInitImports}
      ${projectInitImport}
      import { hydrate } from '${hydrateImportPath}';
      ${imports}${slowViewStateDecl}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};
${clientInitExecution}
      const target = document.getElementById('target');
      const rootElement = target.firstElementChild;
      const pageComp = hydrateCompositeJayComponent(hydrate, viewState, fastCarryForward, ${compositeParts}, trackByMap, rootElement);

      const instance = pageComp({/* placeholder for page props */});
${automationWrap}
    </script>`;
}
