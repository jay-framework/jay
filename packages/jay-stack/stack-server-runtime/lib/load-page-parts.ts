import { ViteDevServer } from 'vite';
import { JayRoute } from '@jay-framework/stack-route-scanner';
import { WithValidations } from '@jay-framework/compiler-shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    HeadlessContractInfo,
    Contract,
    discoverHeadlessInstances,
    injectHeadfullFSTemplates,
    assignCoordinatesToJayHtml,
    type DiscoveredHeadlessInstance,
    type ForEachHeadlessInstance,
} from '@jay-framework/compiler-jay-html';
import { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';
import { JayRollupConfig } from '@jay-framework/rollup-plugin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface DevServerPagePart {
    compDefinition: AnyJayStackComponentDefinition;
    key?: string;
    clientImport: string;
    clientPart: string;
    /** Contract metadata for dynamic contract components */
    contractInfo?: {
        contractName: string;
        metadata?: Record<string, unknown>;
    };
}

/**
 * Instance-only headless component (no key attribute).
 * Used for server-side phase orchestration of `<jay:xxx>` instances.
 */
export interface HeadlessInstanceComponent {
    /** Contract name from the script tag (e.g., "product-card") */
    contractName: string;
    /** Component definition for calling slowlyRender/fastRender */
    compDefinition: AnyJayStackComponentDefinition;
    /** Parsed contract (for phase detection in slow render Pass 2) */
    contract: Contract;
}

export interface LoadedPageParts {
    parts: DevServerPagePart[];
    /** TrackBy map for server-side merge (slow → fast) */
    serverTrackByMap?: Record<string, string>;
    /** TrackBy map for client-side merge (fast → interactive) */
    clientTrackByMap?: Record<string, string>;
    /** NPM package names used on this page (for filtering plugin inits) */
    usedPackages: Set<string>;
    /** Headless contracts for slow rendering (already loaded by parseJayFile) */
    headlessContracts: HeadlessContractInfo[];
    /** Instance-only headless components (no key) for server-side phase orchestration */
    headlessInstanceComponents: HeadlessInstanceComponent[];
    /** Discovered <jay:xxx> instances from the jay-html (DL#109) */
    discoveredInstances: DiscoveredHeadlessInstance[];
    /** Discovered forEach <jay:xxx> instances from the jay-html (DL#109) */
    forEachInstances: ForEachHeadlessInstance[];
    /** Absolute paths to linked CSS files (from <link rel="stylesheet">) for dev-server watching */
    linkedCssFiles: string[];
    /** Absolute paths to headfull FS component jay-html files for dev-server watching */
    linkedComponentFiles: string[];
}

export interface LoadPagePartsOptions {
    /**
     * Path to pre-rendered jay-html file to use instead of the original.
     * When provided, this file (with slow-phase bindings resolved) is read.
     * Import resolution still uses the original jay-html's directory.
     */
    preRenderedPath?: string;
    /**
     * Pre-loaded jay-html content to use instead of reading from disk.
     * When provided (e.g., from SlowRenderCache with cache tag already stripped),
     * this content is used directly, avoiding an extra file read.
     */
    preRenderedContent?: string;
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
        const exportName = route.componentExport || 'page';
        const pageComponent = (await vite.ssrLoadModule(route.compPath))[exportName];
        parts.push({
            compDefinition: pageComponent,
            clientImport: `import {${exportName}} from '${route.compPath}'`,
            clientPart: `{comp: ${exportName}.comp, contextMarkers: ${exportName}.contexts || []}`,
        });
    }

    // Use pre-loaded content if provided, otherwise read from file
    const jayHtmlFilePath = options?.preRenderedPath ?? route.jayHtmlPath;
    const jayHtmlSource =
        options?.preRenderedContent ?? (await fs.readFile(jayHtmlFilePath)).toString();
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
        const headlessInstanceComponents: HeadlessInstanceComponent[] = [];

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

            // Only page-level headless imports (with key) create page parts
            // Instance-only imports (no key) are handled by the compiled template
            if (headlessImport.key) {
                const key = headlessImport.key;
                const part: DevServerPagePart = {
                    key,
                    compDefinition,
                    clientImport: `import {${name}} from '${clientModuleImport}'`,
                    clientPart: `{comp: ${name}.comp, contextMarkers: ${name}.contexts || [], key: '${key}'}`,
                    // Include contract info for dynamic contract components
                    contractInfo: headlessImport.contract
                        ? {
                              contractName: headlessImport.contract.name,
                              metadata: headlessImport.metadata,
                          }
                        : undefined,
                };
                parts.push(part);
            }

            // Track instance-only headless components (no key) for server-side phase orchestration
            if (!headlessImport.key && headlessImport.contract) {
                headlessInstanceComponents.push({
                    contractName: headlessImport.contractName,
                    compDefinition,
                    contract: headlessImport.contract,
                });
            }
        }
        // Extract headless contracts for slow rendering
        const headlessContracts: HeadlessContractInfo[] = jayHtml.headlessImports
            .filter((hi) => hi.contract !== undefined && hi.key !== undefined)
            .map((hi) => ({
                key: hi.key!,
                contract: hi.contract!,
                contractPath: hi.contractPath,
            }));

        // Discover headless instances in the jay-html (DL#109).
        // For pre-rendered HTML, this finds instances after slow bindings are resolved.
        // For original jay-html, inject headfull FS templates first so nested headless
        // instances inside headfull components are discoverable (DL#123).
        const jayHtmlForDiscovery = injectHeadfullFSTemplates(
            jayHtmlSource,
            dirName,
            JAY_IMPORT_RESOLVER,
        );
        // Discovery first (assigns ref attributes), then coordinate assignment (DL#126).
        // Re-discover after coordinates are assigned so keys use jay-coordinate-base.
        let discoveryResult: ReturnType<typeof discoverHeadlessInstances>;
        if (headlessInstanceComponents.length > 0) {
            const firstDiscovery = discoverHeadlessInstances(jayHtmlForDiscovery);
            const headlessContractNameSet = new Set(
                jayHtml.headlessImports.map((hi) => hi.contractName),
            );
            const jayHtmlWithCoords = assignCoordinatesToJayHtml(
                firstDiscovery.preRenderedJayHtml,
                headlessContractNameSet,
            );
            discoveryResult = discoverHeadlessInstances(jayHtmlWithCoords);
        } else {
            discoveryResult = {
                instances: [],
                forEachInstances: [],
                preRenderedJayHtml: jayHtmlSource,
            };
        }

        return {
            parts,
            serverTrackByMap: jayHtml.serverTrackByMap,
            clientTrackByMap: jayHtml.clientTrackByMap,
            usedPackages,
            headlessContracts,
            headlessInstanceComponents,
            discoveredInstances: discoveryResult.instances,
            forEachInstances: discoveryResult.forEachInstances,
            linkedCssFiles: jayHtml.linkedCssFiles ?? [],
            linkedComponentFiles: jayHtml.linkedComponentFiles ?? [],
        };
    });
}
