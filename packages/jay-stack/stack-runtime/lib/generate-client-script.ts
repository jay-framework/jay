import {DevServerPagePart} from "./load-page-parts";
import path from "node:path";

export function generateClientScript(defaultViewState: object,
                                     fastCarryForward: object,
                                     parts: DevServerPagePart[],
                                     pagesBase: string) {
    const imports = parts.map(part => part.clientImport).join('\n')
    const compositeParts = parts.map(part => part.clientPart).join(',\n')
    const jayHtmlPath = path.resolve(pagesBase, './page.jay-html');

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
      import {makeCompositeJayComponent} from "jay-stack-runtime";
      import { render } from '${jayHtmlPath}';
      ${imports}
      
      const viewState = ${JSON.stringify(defaultViewState)};
      const fastCarryForward = ${JSON.stringify(fastCarryForward)};

      const target = document.getElementById('target');
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
        ${compositeParts}
      ])

      const instance = pageComp({...viewState, ...carryForward})
      target.appendChild(instance.element.dom);
    </script>
  </body>
</html>`
}
