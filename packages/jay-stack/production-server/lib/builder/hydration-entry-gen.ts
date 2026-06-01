import path from 'node:path';
import fs from 'node:fs/promises';
import { getLogger } from '@jay-framework/logger';

export interface KeyedPartInfo {
    key: string;
    modulePath: string;
    exportName: string;
}

export interface ClientInitInfo {
    modulePath: string;
    exportName: string;
    key: string;
}

export interface HydrationEntryOptions {
    jayHtmlPath: string;
    pageModulePath: string;
    pageExportName?: string;
    slowViewState: object;
    trackByMap: Record<string, string>;
    outputPath: string;
    keyedParts?: KeyedPartInfo[];
    clientInits?: ClientInitInfo[];
    /** When set, import hydrate from this shared route module instead of ?jay-hydrate */
    routeHydrateImport?: string;
}

export interface RouteHydrationEntryOptions {
    hydrateImport: string;
    pageModulePath: string;
    pageExportName?: string;
    trackByMap: Record<string, string>;
    outputPath: string;
    keyedParts?: KeyedPartInfo[];
    clientInits?: ClientInitInfo[];
}

export async function generateHydrationEntry(options: HydrationEntryOptions): Promise<void> {
    const {
        jayHtmlPath,
        pageModulePath,
        pageExportName = 'page',
        slowViewState,
        trackByMap,
        outputPath,
        keyedParts = [],
        clientInits = [],
        routeHydrateImport,
    } = options;

    const hydrateImport = routeHydrateImport || `${jayHtmlPath}?jay-hydrate`;

    const partImports = keyedParts
        .map((p, i) => `import { ${p.exportName} as keyedPart${i} } from '${p.modulePath}';`)
        .join('\n');

    const hasPageModule = pageModulePath && pageExportName;
    const pagePartExpr = hasPageModule
        ? `pagePart && pagePart.comp ? { comp: pagePart.comp, contextMarkers: pagePart.contexts || [] } : null`
        : `null`;
    const partsArray = [
        pagePartExpr,
        ...keyedParts.map(
            (p, i) =>
                `keyedPart${i} && keyedPart${i}.comp ? { comp: keyedPart${i}.comp, contextMarkers: keyedPart${i}.contexts || [], key: '${p.key}' } : null`,
        ),
    ];

    const pageImport = hasPageModule
        ? `import { ${pageExportName} as pagePart } from '${pageModulePath}';`
        : '';

    const initImports = clientInits
        .map((ci, i) => `import { ${ci.exportName} as clientInit${i} } from '${ci.modulePath}';`)
        .join('\n');

    const initCalls = clientInits
        .map(
            (ci, i) =>
                `    if (clientInit${i}?._clientInit) await clientInit${i}._clientInit(clientInitData['${ci.key}'] || {});`,
        )
        .join('\n');

    const hasClientInit = clientInits.length > 0;

    const code = `import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { hydrate } from '${hydrateImport}';
${pageImport}
${partImports}
${initImports}

const slowViewState = ${JSON.stringify(slowViewState)};
const trackByMap = ${JSON.stringify(trackByMap)};

export async function init(fastViewState, fastCarryForward${hasClientInit ? ', clientInitData' : ''}) {
${initCalls}
    const viewState = deepMergeViewStates(slowViewState, fastViewState, trackByMap);
    const target = document.getElementById('target');
    const rootElement = target.firstElementChild;
    const parts = [
        ${partsArray.join(',\n        ')}
    ].filter(p => p !== null);
    const pageComp = hydrateCompositeJayComponent(
        hydrate, viewState, fastCarryForward,
        parts, trackByMap, rootElement
    );
    return pageComp({});
}
`;

    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, code, 'utf-8');

    getLogger().info(`[Build] Generated hydration entry: ${path.basename(outputPath)}`);
}

/**
 * Generate a per-route hydration entry (DL#144).
 * slowViewState is received as a parameter to init() instead of baked as a literal.
 * This makes the entry identical across all instances of a route.
 */
export async function generateRouteHydrationEntry(
    options: RouteHydrationEntryOptions,
): Promise<void> {
    const {
        hydrateImport,
        pageModulePath,
        pageExportName = 'page',
        trackByMap,
        outputPath,
        keyedParts = [],
        clientInits = [],
    } = options;

    const partImports = keyedParts
        .map((p, i) => `import { ${p.exportName} as keyedPart${i} } from '${p.modulePath}';`)
        .join('\n');

    const hasPageModule = pageModulePath && pageExportName;
    const pagePartExpr = hasPageModule
        ? `pagePart && pagePart.comp ? { comp: pagePart.comp, contextMarkers: pagePart.contexts || [] } : null`
        : `null`;
    const partsArray = [
        pagePartExpr,
        ...keyedParts.map(
            (p, i) =>
                `keyedPart${i} && keyedPart${i}.comp ? { comp: keyedPart${i}.comp, contextMarkers: keyedPart${i}.contexts || [], key: '${p.key}' } : null`,
        ),
    ];

    const pageImport = hasPageModule
        ? `import { ${pageExportName} as pagePart } from '${pageModulePath}';`
        : '';

    const initImports = clientInits
        .map((ci, i) => `import { ${ci.exportName} as clientInit${i} } from '${ci.modulePath}';`)
        .join('\n');

    const initCalls = clientInits
        .map(
            (ci, i) =>
                `    if (clientInit${i}?._clientInit) await clientInit${i}._clientInit(clientInitData['${ci.key}'] || {});`,
        )
        .join('\n');

    const code = `import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { hydrate } from '${hydrateImport}';
${pageImport}
${partImports}
${initImports}

const trackByMap = ${JSON.stringify(trackByMap)};

export async function init(slowViewState, fastViewState, fastCarryForward, clientInitData) {
${initCalls}
    const viewState = deepMergeViewStates(slowViewState, fastViewState, trackByMap);
    const target = document.getElementById('target');
    const rootElement = target.firstElementChild;
    const parts = [
        ${partsArray.join(',\n        ')}
    ].filter(p => p !== null);
    const pageComp = hydrateCompositeJayComponent(
        hydrate, viewState, fastCarryForward,
        parts, trackByMap, rootElement
    );
    return pageComp({});
}
`;

    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, code, 'utf-8');

    getLogger().info(`[Build] Generated route hydration entry: ${path.basename(outputPath)}`);
}
