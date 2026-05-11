import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
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

export interface ProductionPageParts {
    parts: DevServerPagePart[];
    headlessContracts: HeadlessContractInfo[];
    headlessInstanceComponents: HeadlessInstanceComponent[];
    discoveredInstances: DiscoveredHeadlessInstance[];
    forEachInstances: ForEachHeadlessInstance[];
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
    const compDefinition: AnyJayStackComponentDefinition = pageModule[exportName] ?? pageModule.default;

    const parts: DevServerPagePart[] = [
        { compDefinition, clientImport: '', clientPart: '' },
    ];

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

    for (const headlessImport of (jayHtml as any).headlessImports ?? []) {
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
                if (!compiledPath.endsWith('.js')) compiledPath += '.js';
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
            parts.push({
                key: headlessImport.key,
                compDefinition: headlessCompDef,
                clientImport: '',
                clientPart: '',
                contractInfo: headlessImport.contract
                    ? { contractName: headlessImport.contract.name, metadata: headlessImport.metadata }
                    : undefined,
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

    const jayHtmlForDiscovery = injectHeadfullFSTemplates(jayHtmlContent, dirName, JAY_IMPORT_RESOLVER);
    let discoveredInstances: DiscoveredHeadlessInstance[] = [];
    let forEachInstances: ForEachHeadlessInstance[] = [];

    if (headlessInstanceComponents.length > 0) {
        const firstDiscovery = discoverHeadlessInstances(jayHtmlForDiscovery);
        const contractNames = new Set(headlessInstanceComponents.map((c) => c.contractName));
        const withCoords = assignCoordinatesToJayHtml(firstDiscovery.preRenderedJayHtml, contractNames);
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
        serverTrackByMap: (jayHtml as any).serverTrackByMap,
        clientTrackByMap: (jayHtml as any).clientTrackByMap,
    };
}
