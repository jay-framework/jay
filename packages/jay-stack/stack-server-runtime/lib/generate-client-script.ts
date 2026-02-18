import { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';
import type { PluginClientInitInfo } from './plugin-init-discovery';

/**
 * Information needed to generate client init script for the project.
 */
export interface ProjectClientInitInfo {
    /** Import path for the init module */
    importPath: string;
    /** Export name for the JayInit constant (default: 'init') */
    initExport?: string;
}

/**
 * Options for client script generation.
 */
export interface GenerateClientScriptOptions {
    /** Enable automation integration (default: true in dev mode) */
    enableAutomation?: boolean;
    /**
     * Slow ViewState that was baked into the pre-rendered jay-html.
     * When provided, this is merged with fastViewState for the automation API
     * so that AI/automation tools can see the complete page state.
     */
    slowViewState?: object;
}

export function generateClientScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    jayHtmlPath: string,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, Record<string, any>> = {},
    projectInit?: ProjectClientInitInfo,
    pluginInits: PluginClientInitInfo[] = [],
    options: GenerateClientScriptOptions = {},
) {
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

    // Generate plugin client init imports
    // Each plugin exports a JayInit object, we need to import it and call _clientInit
    const pluginClientInitImports = pluginInits
        .map((plugin, idx) => {
            return `import { ${plugin.initExport} as jayInit${idx} } from "${plugin.importPath}";`;
        })
        .join('\n      ');

    // Generate project init import
    const projectInitImport = projectInit
        ? `import { ${projectInit.initExport || 'init'} as projectJayInit } from "${projectInit.importPath}";`
        : '';

    // Call each plugin's _clientInit with its namespaced serverData
    const pluginClientInitCalls = pluginInits
        .map((plugin, idx) => {
            const pluginData = clientInitData[plugin.name] || {};
            return `if (typeof jayInit${idx}._clientInit === 'function') {
        console.log('[DevServer] Running client init: ${plugin.name}');
        await jayInit${idx}._clientInit(${JSON.stringify(pluginData)});
      }`;
        })
        .join('\n      ');

    // Call project's _clientInit
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
    // When slow ViewState is baked into pre-rendered jay-html, we need to pass
    // the full merged state to automation so AI tools can see all page data
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

    const automationWrap = enableAutomation
        ? hasSlowViewState
            ? `
      // Wrap with automation for dev tooling
      // Deep merge slow+fast ViewState so automation can see full page state
      const fullViewState = deepMergeViewStates(slowViewState, {...viewState, ...fastCarryForward}, trackByMap);
      const wrapped = wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
      registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
      window.__jay = window.__jay || {};
      window.__jay.automation = wrapped.automation;
      window.dispatchEvent(new Event('jay:automation-ready'));
      target.appendChild(wrapped.element.dom);`
            : `
      // Wrap with automation for dev tooling
      const wrapped = wrapWithAutomation(instance);
      registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
      window.__jay = window.__jay || {};
      window.__jay.automation = wrapped.automation;
      window.dispatchEvent(new Event('jay:automation-ready'));
      target.appendChild(wrapped.element.dom);`
        : `
      target.appendChild(instance.element.dom);`;

    return `<!doctype html>
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
      ${automationImport}
      ${pluginClientInitImports}
      ${projectInitImport}
      import { render } from '${jayHtmlPath}';
      ${imports}${slowViewStateDecl}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};
${clientInitExecution}
      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts}, trackByMap)

      const instance = pageComp({/* placeholder for page props */})
${automationWrap}
    </script>
  </body>
</html>`;
}
