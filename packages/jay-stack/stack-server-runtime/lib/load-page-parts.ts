import { ViteDevServer } from 'vite';
import { JayRoute } from '@jay-framework/stack-route-scanner';
import { WithValidations } from '@jay-framework/compiler-shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJayFile } from '@jay-framework/compiler-jay-html';
import { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';
import { JayRollupConfig } from '@jay-framework/rollup-plugin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    clientImport: string;
    clientPart: string;
}

export async function loadPageParts(
    vite: ViteDevServer,
    route: JayRoute,
    pagesBase: string,
    jayRollupConfig: JayRollupConfig,
): Promise<WithValidations<DevServerPagePart[]>> {
    const exists = await fs
        .access(route.compPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);

    const parts: DevServerPagePart[] = [];
    const pageCode = path.resolve(pagesBase, './page.ts');
    if (exists) {
        const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
        parts.push({
            compDefinition: pageComponent,
            clientImport: `import {page} from '${pageCode}'`,
            clientPart: `{comp: page.comp, contextMarkers: []}`,
        });
    }

    const jayHtmlSource = (await fs.readFile(route.jayHtmlPath)).toString();
    const fileName = path.basename(route.jayHtmlPath);
    const dirName = path.dirname(route.jayHtmlPath);
    const module = await import('@jay-framework/compiler-jay-html');
    const JAY_IMPORT_RESOLVER = module.JAY_IMPORT_RESOLVER;
    const jayHtmlWithValidations = await parseJayFile(
        jayHtmlSource,
        fileName,
        dirName,
        {
            relativePath: jayRollupConfig.tsConfigFilePath,
        },
        JAY_IMPORT_RESOLVER,
    );

    return jayHtmlWithValidations.mapAsync(async (jayHtml) => {
        for await (const headlessImport of jayHtml.headlessImports) {
            const module = headlessImport.codeLink.module;
            const name = headlessImport.codeLink.names[0].name;
            const modulePath =
                module[0] === '.'
                    ? path.resolve(dirName, module)
                    : require.resolve(module, { paths: require.resolve.paths(dirName) });
            const compDefinition = (await vite.ssrLoadModule(modulePath))[name];
            const moduleImport = module.startsWith('./') ? path.resolve(pagesBase, module) : module;
            const key = headlessImport.key;
            const part: DevServerPagePart = {
                key,
                compDefinition,
                clientImport: `import {${name}} from '${moduleImport}'`,
                clientPart: `{comp: ${name}.comp, contextMarkers: [], key: '${headlessImport.key}'}`,
            };
            parts.push(part);
        }
        return parts;
    });
}
