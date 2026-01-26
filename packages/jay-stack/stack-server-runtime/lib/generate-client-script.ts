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
    const { enableAutomation = true } = options;
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
    const automationImport = enableAutomation
        ? `import { wrapWithAutomation, AUTOMATION_CONTEXT } from "@jay-framework/runtime-automation";
      import { registerGlobalContext } from "@jay-framework/runtime";`
        : '';

    const automationWrap = enableAutomation
        ? `
      // Wrap with automation for dev tooling
      const wrapped = wrapWithAutomation(instance);
      registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
      window.__jay = window.__jay || {};
      window.__jay.automation = wrapped.automation;
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
      ${imports}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};
${clientInitExecution}
      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts}, trackByMap)

      const instance = pageComp({...viewState, ...fastCarryForward})
${automationWrap}
    </script>
  </body>
</html>`;
}
