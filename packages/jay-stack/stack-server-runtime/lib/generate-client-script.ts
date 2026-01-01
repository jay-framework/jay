import { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';
import type { PluginWithInit } from './plugin-init-discovery';

export function generateClientScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    jayHtmlPath: string,
    trackByMap: TrackByMap = {},
    clientInitData: Record<string, any> = {},
    clientInitFilePath?: string,
    pluginsWithClientInit: PluginWithInit[] = [],
) {
    const imports =
        parts.length > 0 ? parts.map((part) => part.clientImport).join('\n') + '\n' : '';
    const compositeParts =
        parts.length > 0
            ? `[
${parts.map((part) => '        ' + part.clientPart).join(',\n')}
        ]`
            : '[]';

    // Filter plugins that have client init
    const clientInitPlugins = pluginsWithClientInit.filter((p) => p.clientInit);

    // Client init imports and execution
    const hasClientInit =
        Object.keys(clientInitData).length > 0 ||
        clientInitFilePath ||
        clientInitPlugins.length > 0;

    const clientInitImport = hasClientInit
        ? `import { runClientInit } from "@jay-framework/stack-client-runtime";`
        : '';

    // Generate plugin client init imports and calls
    const pluginClientInitImports = clientInitPlugins
        .map((plugin, idx) => {
            const importPath = plugin.isLocal
                ? `${plugin.pluginPath}/lib/index.client` // Local plugin client bundle
                : `${plugin.packageName}/client`; // NPM plugin client export
            return `import { ${plugin.clientInit!.export} as pluginClientInit${idx} } from "${importPath}";`;
        })
        .join('\n      ');

    // Pass plugin name to each client init so it can register with the correct key
    const pluginClientInitCalls = clientInitPlugins
        .map((plugin, idx) => `pluginClientInit${idx}({ pluginName: "${plugin.name}" });`)
        .join('\n      ');

    const clientInitFileImport = clientInitFilePath ? `import "${clientInitFilePath}";` : '';

    const clientInitExecution = hasClientInit
        ? `
      // Plugin client initialization (in dependency order)
      ${pluginClientInitCalls}
      
      // Client initialization (static config from server)
      const clientInitData = ${JSON.stringify(clientInitData)};
      await runClientInit(clientInitData);
`
        : '';

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
      ${clientInitImport}
      ${pluginClientInitImports}
      import { render } from '${jayHtmlPath}';
      ${clientInitFileImport}
      ${imports}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};
${clientInitExecution}
      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts}, trackByMap)

      const instance = pageComp({...viewState, ...fastCarryForward})
      target.appendChild(instance.element.dom);
    </script>
  </body>
</html>`;
}
