import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { getLogger } from '@jay-framework/logger';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
    discoverHeadlessInstances,
    assignCoordinatesToJayHtml,
    type HeadlessContractInfo,
    type DiscoveredHeadlessInstance,
    type ForEachHeadlessInstance,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors } from '@jay-framework/compiler-shared';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';
import type {
    DevServerPagePart,
    HeadlessInstanceComponent,
} from '@jay-framework/stack-server-runtime';
import type { JayRoute } from '@jay-framework/stack-route-scanner';

const require = createRequire(import.meta.url);

export interface KeyedPartModule {
    key: string;
    modulePath: string;
    exportName: string;
}

export interface ProductionPageParts {
    parts: DevServerPagePart[];
    headlessContracts: HeadlessContractInfo[];
    headlessInstanceComponents: HeadlessInstanceComponent[];
    discoveredInstances: DiscoveredHeadlessInstance[];
    forEachInstances: ForEachHeadlessInstance[];
    keyedPartModules: KeyedPartModule[];
    serverTrackByMap?: Record<string, string>;
    clientTrackByMap?: Record<string, string>;
}

export async function loadProductionPageParts(
    route: JayRoute | { jayHtmlPath: string; componentExport?: string },
    pageModule: any,
    jayHtmlContent: string,
    projectRoot: string,
    tsConfigFilePath?: string,
    serverBuildDir?: string,
): Promise<ProductionPageParts> {
    const exportName = (route as any).componentExport || 'page';
    const compDefinition: AnyJayStackComponentDefinition | undefined =
        pageModule[exportName] ?? pageModule.default;

    const parts: DevServerPagePart[] = compDefinition
        ? [{ compDefinition, clientImport: '', clientPart: '' }]
        : [];

    const dirName = path.dirname(route.jayHtmlPath);
    const fileName = path.basename(route.jayHtmlPath);

    const jayHtmlWithValidations = await parseJayFile(
        jayHtmlContent,
        fileName,
        dirName,
        { relativePath: tsConfigFilePath },
        JAY_IMPORT_RESOLVER,
        projectRoot,
    );
    const jayHtml = checkValidationErrors(jayHtmlWithValidations);

    const headlessInstanceComponents: HeadlessInstanceComponent[] = [];
    const keyedPartModules: KeyedPartModule[] = [];

    const headlessImports = (jayHtml as any).headlessImports ?? [];
    getLogger().info(
        `[Build] headlessImports for ${fileName}: ${headlessImports.length}, keys: ${Object.keys(jayHtml as any).join(',')}`,
    );

    for (const headlessImport of headlessImports) {
        const module = headlessImport.codeLink.module;
        const name = headlessImport.codeLink.names[0].name;
        const isLocalModule = module[0] === '.' || module[0] === '/';
        let modulePath: string;
        if (isLocalModule) {
            const sourcePath = path.resolve(dirName, module);
            if (serverBuildDir) {
                const relativeToSrc = path.relative(path.join(projectRoot, 'src'), sourcePath);
                let compiledPath = path.join(serverBuildDir, relativeToSrc);
                compiledPath = compiledPath.replace(/\.ts$/, '.js');
                if (!compiledPath.endsWith('.js')) {
                    // Check for directory with index.js (e.g., components/kitan-header/index.js)
                    const indexPath = path.join(compiledPath, 'index.js');
                    try {
                        await fs.access(indexPath);
                        compiledPath = indexPath;
                    } catch {
                        compiledPath += '.js';
                    }
                }
                modulePath = compiledPath;
            } else {
                modulePath = sourcePath;
            }
        } else {
            modulePath = require.resolve(module, { paths: [dirName] });
        }

        const headlessModule = await import(modulePath);
        const headlessCompDef = headlessModule[name];

        if (headlessImport.key) {
            // For client import: NPM packages use /client entry, local uses absolute source path
            const clientModulePath = isLocalModule
                ? path.resolve(dirName, module)
                : `${module}/client`;
            parts.push({
                key: headlessImport.key,
                compDefinition: headlessCompDef,
                clientImport: '',
                clientPart: '',
                contractInfo: headlessImport.contract
                    ? {
                          contractName: headlessImport.contract.name,
                          metadata: headlessImport.metadata,
                      }
                    : undefined,
            });
            keyedPartModules.push({
                key: headlessImport.key,
                modulePath: clientModulePath,
                exportName: name,
            });
        }

        if (!headlessImport.key && headlessImport.contract) {
            headlessInstanceComponents.push({
                contractName: headlessImport.contractName,
                compDefinition: headlessCompDef,
                contract: headlessImport.contract,
            });
        }
    }

    const headlessContracts: HeadlessContractInfo[] = ((jayHtml as any).headlessImports ?? [])
        .filter((hi: any) => hi.contract && hi.key)
        .map((hi: any) => ({
            key: hi.key,
            contract: hi.contract,
            contractPath: hi.contractPath,
        }));

    // Use pre-rendered jay-html for discovery — slowForEach items are already
    // unrolled into static instances with coordinate keys matching carryForward.__instances.
    const jayHtmlForDiscovery = injectHeadfullFSTemplates(
        jayHtmlContent,
        dirName,
        JAY_IMPORT_RESOLVER,
    );
    let discoveredInstances: DiscoveredHeadlessInstance[] = [];
    let forEachInstances: ForEachHeadlessInstance[] = [];

    if (headlessInstanceComponents.length > 0) {
        const firstDiscovery = discoverHeadlessInstances(jayHtmlForDiscovery);
        const contractNames = new Set(headlessInstanceComponents.map((c) => c.contractName));
        const withCoords = assignCoordinatesToJayHtml(
            firstDiscovery.preRenderedJayHtml,
            contractNames,
        );
        const finalDiscovery = discoverHeadlessInstances(withCoords);
        discoveredInstances = finalDiscovery.instances;
        forEachInstances = finalDiscovery.forEachInstances;
    }

    return {
        parts,
        headlessContracts,
        headlessInstanceComponents,
        discoveredInstances,
        forEachInstances,
        keyedPartModules,
        serverTrackByMap: (jayHtml as any).serverTrackByMap,
        clientTrackByMap: (jayHtml as any).clientTrackByMap,
    };
}
