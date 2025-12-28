import { DevServerPagePart } from './load-page-parts';
import type { TrackByMap } from '@jay-framework/view-state-merge';

export function generateClientScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    jayHtmlPath: string,
    trackByMap: TrackByMap = {},
) {
    const imports =
        parts.length > 0 ? parts.map((part) => part.clientImport).join('\n') + '\n' : '';
    const compositeParts =
        parts.length > 0
            ? `[
${parts.map((part) => '        ' + part.clientPart).join(',\n')}
        ]`
            : '[]';

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
      import { render } from '${jayHtmlPath}';
      ${imports}
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};
      const trackByMap = ${JSON.stringify(trackByMap)};

      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts}, trackByMap)

      const instance = pageComp({...viewState, ...fastCarryForward})
      target.appendChild(instance.element.dom);
    </script>
  </body>
</html>`;
}
