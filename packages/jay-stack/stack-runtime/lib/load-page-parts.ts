import {ViteDevServer} from "vite";
import {JayRoute} from "jay-stack-route-scanner";
import {WithValidations} from "jay-compiler-shared";
import fs from "node:fs/promises";
import path from "node:path";
import {JAY_IMPORT_RESOLVER, parseJayFile} from "jay-compiler-jay-html";
import {DevServerOptions} from "./dev-server";
import {AnyJayStackComponentDefinition} from "./jay-stack-types";

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    clientImport: string,
    clientPart: string
}

export async function loadPageParts(vite: ViteDevServer, route: JayRoute, options: DevServerOptions): Promise<WithValidations<DevServerPagePart[]>> {
    const exists = await fs.access(route.compPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);

    const parts: DevServerPagePart[] = [];
    const pageCode = path.resolve(options.pagesBase, './page.ts')
    if (exists) {
        const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
        parts.push({
            compDefinition: pageComponent,
            clientImport: `import {page} from '${pageCode}`,
            clientPart: `{comp: page.comp, contextMarkers: []}`
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
            const module = headlessImport.codeLink.module;
            const name = headlessImport.codeLink.names[0].name
            const modulePath = path.resolve(dirName, module)
            const compDefinition = (await vite.ssrLoadModule(modulePath))[name];
            const moduleImport = module.startsWith('./')?
                path.resolve(options.pagesBase, module):
                module
            const key = headlessImport.key;
            const part: DevServerPagePart = {
                key,
                compDefinition,
                clientImport: `import {${name}} from '${moduleImport}'`,
                clientPart: `{comp: ${name}.comp, contextMarkers: [], viewStateKey: '${headlessImport.key}'}`
            }
            parts.push(part)
        }
        return parts;
    })
}