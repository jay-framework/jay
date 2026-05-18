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

export interface HeadlessModuleInfo {
    modulePath: string;
    exportName: string;
    isLocal: boolean;
    contractName?: string;
    key?: string;
    propNames?: string[];
    contractInfo?: { contractName: string; metadata?: Record<string, unknown> };
}

export interface ProductionPageParts {
    parts: DevServerPagePart[];
    headlessContracts: HeadlessContractInfo[];
    headlessInstanceComponents: HeadlessInstanceComponent[];
    discoveredInstances: DiscoveredHeadlessInstance[];
    forEachInstances: ForEachHeadlessInstance[];
    keyedPartModules: KeyedPartModule[];
    headlessModuleInfos: HeadlessModuleInfo[];
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
    const headlessModuleInfos: HeadlessModuleInfo[] = [];

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
            const clientModulePath = isLocalModule
                ? path.resolve(dirName, module)
                : `${module}/client`;
            const ci = headlessImport.contract
                ? { contractName: headlessImport.contract.name, metadata: headlessImport.metadata }
                : undefined;
            parts.push({
                key: headlessImport.key,
                compDefinition: headlessCompDef,
                clientImport: '',
                clientPart: '',
                contractInfo: ci,
            });
            keyedPartModules.push({
                key: headlessImport.key,
                modulePath: clientModulePath,
                exportName: name,
            });
            headlessModuleInfos.push({
                modulePath,
                exportName: name,
                isLocal: isLocalModule,
                key: headlessImport.key,
                contractInfo: ci,
            });
        }

        if (!headlessImport.key && headlessImport.contract) {
            headlessInstanceComponents.push({
                contractName: headlessImport.contractName,
                compDefinition: headlessCompDef,
                contract: headlessImport.contract,
            });
            headlessModuleInfos.push({
                modulePath,
                exportName: name,
                isLocal: isLocalModule,
                contractName: headlessImport.contractName,
                propNames: headlessImport.contract.props?.map((p: any) => p.name) ?? [],
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
        headlessModuleInfos,
        serverTrackByMap: (jayHtml as any).serverTrackByMap,
        clientTrackByMap: (jayHtml as any).clientTrackByMap,
    };
}

// ── Page Parts Config (DL#137) ──

interface PagePartsConfigEntry {
    modulePath: string;
    exportName: string;
    source: 'npm' | 'local';
}

export interface PagePartsConfig {
    parts: Array<
        PagePartsConfigEntry & {
            key?: string;
            contractInfo?: { contractName: string; metadata?: Record<string, unknown> };
        }
    >;
    instanceComponents: Array<
        PagePartsConfigEntry & {
            contractName: string;
            propNames: string[];
        }
    >;
    forEachInstances: Array<{
        contractName: string;
        forEachPath: string;
        trackBy: string;
        propBindings: Record<string, string>;
        coordinateSuffix: string;
    }>;
}

export function buildPagePartsConfig(
    pageParts: ProductionPageParts,
    pageServerModule: string,
    pageExportName: string,
    buildDir: string,
): PagePartsConfig {
    const parts: PagePartsConfig['parts'] = [];

    if (pageParts.parts.length > 0 && pageParts.parts[0].compDefinition) {
        parts.push({
            modulePath: pageServerModule,
            exportName: pageExportName,
            source: 'local',
        });
    }

    for (const info of pageParts.headlessModuleInfos) {
        if (info.key) {
            parts.push({
                modulePath: info.isLocal
                    ? path.relative(buildDir, info.modulePath)
                    : info.modulePath,
                exportName: info.exportName,
                source: info.isLocal ? 'local' : 'npm',
                key: info.key,
                contractInfo: info.contractInfo,
            });
        }
    }

    const instanceComponents: PagePartsConfig['instanceComponents'] = [];
    for (const info of pageParts.headlessModuleInfos) {
        if (info.contractName) {
            instanceComponents.push({
                modulePath: info.isLocal
                    ? path.relative(buildDir, info.modulePath)
                    : info.modulePath,
                exportName: info.exportName,
                source: info.isLocal ? 'local' : 'npm',
                contractName: info.contractName,
                propNames: info.propNames ?? [],
            });
        }
    }

    return {
        parts,
        instanceComponents,
        forEachInstances: pageParts.forEachInstances.map((fi) => ({
            contractName: fi.contractName,
            forEachPath: fi.forEachPath,
            trackBy: fi.trackBy,
            propBindings: fi.propBindings,
            coordinateSuffix: fi.coordinateSuffix,
        })),
    };
}

export interface ServeTimeContract {
    props: Array<{ name: string }>;
}

export async function loadPagePartsFromConfig(
    configPath: string,
    buildDir: string,
): Promise<ProductionPageParts> {
    const config: PagePartsConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    async function importModule(entry: PagePartsConfigEntry): Promise<any> {
        if (entry.source === 'local') {
            return import(path.join(buildDir, entry.modulePath));
        }
        return import(entry.modulePath);
    }

    const parts: DevServerPagePart[] = [];
    for (const entry of config.parts) {
        const mod = await importModule(entry);
        parts.push({
            compDefinition: mod[entry.exportName] ?? mod.default,
            key: entry.key,
            clientImport: '',
            clientPart: '',
            contractInfo: entry.contractInfo,
        });
    }

    const headlessInstanceComponents: HeadlessInstanceComponent[] = [];
    for (const entry of config.instanceComponents) {
        const mod = await importModule(entry);
        const serveTimeContract: ServeTimeContract = {
            props: entry.propNames.map((name) => ({ name })),
        };
        headlessInstanceComponents.push({
            contractName: entry.contractName,
            compDefinition: mod[entry.exportName] ?? mod.default,
            contract: serveTimeContract as any,
        });
    }

    return {
        parts,
        headlessContracts: [],
        headlessInstanceComponents,
        discoveredInstances: [],
        forEachInstances: config.forEachInstances as ForEachHeadlessInstance[],
        keyedPartModules: [],
        headlessModuleInfos: [],
    };
}
