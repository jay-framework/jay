import type { ArtifactStore } from '../serve/artifact-store';
import type {
    DevServerPagePart,
    HeadlessInstanceComponent,
    ForEachHeadlessInstance,
} from '@jay-framework/stack-server-runtime';

export interface PagePartsConfigEntry {
    modulePath: string;
    exportName: string;
    source: 'local' | 'npm';
    structural?: boolean;
}

export interface PagePartsConfig {
    parts: Array<
        PagePartsConfigEntry & {
            key?: string;
            contractInfo?: { contractName: string; metadata?: Record<string, unknown> };
            headlessProps?: Record<string, string>;
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

interface ServeTimeContract {
    props: Array<{ name: string }>;
}

export interface ProductionPageParts {
    parts: DevServerPagePart[];
    headlessContracts: any[];
    headlessInstanceComponents: HeadlessInstanceComponent[];
    discoveredInstances: any[];
    forEachInstances: ForEachHeadlessInstance[];
    keyedPartModules: any[];
    headlessModuleInfos: any[];
}

export async function loadPagePartsFromConfig(
    configPath: string,
    artifacts: ArtifactStore,
): Promise<ProductionPageParts> {
    const config: PagePartsConfig = await artifacts.readPagePartsConfig(configPath);

    async function importModule(entry: PagePartsConfigEntry): Promise<any> {
        if (!entry.modulePath) {
            throw new Error(
                `Empty modulePath in page-parts.json for "${entry.exportName}" (source: ${entry.source}). Rebuild required.`,
            );
        }
        return artifacts.loadModule(entry.modulePath, entry.source === 'local');
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
            headlessProps: entry.headlessProps,
        });
    }

    const headlessInstanceComponents: HeadlessInstanceComponent[] = [];
    for (const entry of config.instanceComponents) {
        const serveTimeContract: ServeTimeContract = {
            props: entry.propNames.map((name) => ({ name })),
        };
        if (entry.structural) continue;
        const mod = await importModule(entry);
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
