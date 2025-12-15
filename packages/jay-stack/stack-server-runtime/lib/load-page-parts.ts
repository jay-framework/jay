import {ViteDevServer} from 'vite';
import {JayRoute} from '@jay-framework/stack-route-scanner';
import {WithValidations} from '@jay-framework/compiler-shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseJayFile, JAY_IMPORT_RESOLVER} from '@jay-framework/compiler-jay-html';
import {AnyJayStackComponentDefinition} from '@jay-framework/fullstack-component';
import {JayRollupConfig} from '@jay-framework/rollup-plugin';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    clientImport: string;
    clientPart: string;
}

export interface LoadedPageParts {
    parts: DevServerPagePart[];
    trackByMap?: Record<string, string>;
}

export async function loadPageParts(
    vite: ViteDevServer,
    route: JayRoute,
    pagesBase: string,
    projectBase: string,
    jayRollupConfig: JayRollupConfig,
): Promise<WithValidations<LoadedPageParts>> {
    const exists = await fs
        .access(route.compPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);

    const parts: DevServerPagePart[] = [];
    if (exists) {
        // Load page component - SSR mode automatically triggers server transformation
        // (client code is stripped because ssrLoadModule sets ssr: true)
        const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
        parts.push({
            compDefinition: pageComponent,
            // Client import uses client-only code (server code stripped)
            clientImport: `import {page} from '${route.compPath}'`,
            clientPart: `{comp: page.comp, contextMarkers: []}`,
        });
    }

    const jayHtmlSource = (await fs.readFile(route.jayHtmlPath)).toString();
    const fileName = path.basename(route.jayHtmlPath);
    const dirName = path.dirname(route.jayHtmlPath);
    const jayHtmlWithValidations = await parseJayFile(
        jayHtmlSource,
        fileName,
        dirName,
        {
            relativePath: jayRollupConfig.tsConfigFilePath,
        },
        JAY_IMPORT_RESOLVER,
        projectBase
    );

    return jayHtmlWithValidations.mapAsync(async (jayHtml) => {
        for await (const headlessImport of jayHtml.headlessImports) {
            const module = headlessImport.codeLink.module;
            const name = headlessImport.codeLink.names[0].name;
            const isLocalModule = module[0] === '.' || module[0] === '/';
            const modulePath = isLocalModule
                ? path.resolve(dirName, module)
                : require.resolve(module, { paths: require.resolve.paths(dirName) });

            // Load component - SSR mode automatically triggers server transformation
            // (client code is stripped because ssrLoadModule sets ssr: true)
            const compDefinition = (await vite.ssrLoadModule(modulePath))[name];

            // Generate client import path
            const moduleImport = module.startsWith('./') ? path.resolve(pagesBase, module) : module;
            const isNpmPackage = !module.startsWith('./') && !module.startsWith('../');
            const clientModuleImport = isNpmPackage
                ? `${moduleImport}/client` // npm packages: use /client export
                : `${moduleImport}`; // local files: use ?jay-client query

            const key = headlessImport.key;
            const part: DevServerPagePart = {
                key,
                compDefinition,
                clientImport: `import {${name}} from '${clientModuleImport}'`,
                clientPart: `{comp: ${name}.comp, contextMarkers: [], key: '${headlessImport.key}'}`,
            };
            parts.push(part);
        }
        return {
            parts,
            trackByMap: jayHtml.trackByMap,
        };
    });
}
