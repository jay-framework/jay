import { ViteDevServer } from 'vite';
import { JayRoute } from '@jay-framework/stack-route-scanner';
import { WithValidations } from '@jay-framework/compiler-shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
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

export interface LoadedPageParts {
    parts: DevServerPagePart[];
    /** TrackBy map for server-side merge (slow → fast) */
    serverTrackByMap?: Record<string, string>;
    /** TrackBy map for client-side merge (fast → interactive) */
    clientTrackByMap?: Record<string, string>;
    /** NPM package names used on this page (for filtering plugin inits) */
    usedPackages: Set<string>;
}

export interface LoadPagePartsOptions {
    /**
     * Path to pre-rendered jay-html file to use instead of the original.
     * When provided, this file (with slow-phase bindings resolved) is read.
     * Import resolution still uses the original jay-html's directory.
     */
    preRenderedPath?: string;
}

export async function loadPageParts(
    vite: ViteDevServer,
    route: JayRoute,
    pagesBase: string,
    projectBase: string,
    jayRollupConfig: JayRollupConfig,
    options?: LoadPagePartsOptions,
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
            clientImport: `import {page} from '${route.compPath}'`,
            clientPart: `{comp: page.comp, contextMarkers: page.contexts || []}`,
        });
    }

    // Use pre-rendered jay-html file if provided, otherwise read from original
    const jayHtmlFilePath = options?.preRenderedPath ?? route.jayHtmlPath;
    const jayHtmlSource = (await fs.readFile(jayHtmlFilePath)).toString();
    // Import resolution uses the original jay-html's directory (not the cache dir)
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
        projectBase,
    );

    return jayHtmlWithValidations.mapAsync(async (jayHtml) => {
        const usedPackages = new Set<string>();

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
            const moduleImport = isLocalModule ? path.resolve(dirName, module) : module;
            const isNpmPackage = !isLocalModule;
            const clientModuleImport = isNpmPackage
                ? `${moduleImport}/client` // npm packages: use /client export
                : `${moduleImport}`; // local files: use ?jay-client query

            // Track NPM packages used on this page (for plugin init filtering)
            if (isNpmPackage) {
                // Extract the package name (handle scoped packages like @wix/stores)
                const packageName = module.startsWith('@')
                    ? module.split('/').slice(0, 2).join('/')
                    : module.split('/')[0];
                usedPackages.add(packageName);
            }

            const key = headlessImport.key;
            const part: DevServerPagePart = {
                key,
                compDefinition,
                clientImport: `import {${name}} from '${clientModuleImport}'`,
                clientPart: `{comp: ${name}.comp, contextMarkers: ${name}.contexts || [], key: '${headlessImport.key}'}`,
            };
            parts.push(part);
        }
        return {
            parts,
            serverTrackByMap: jayHtml.serverTrackByMap,
            clientTrackByMap: jayHtml.clientTrackByMap,
            usedPackages,
        };
    });
}
