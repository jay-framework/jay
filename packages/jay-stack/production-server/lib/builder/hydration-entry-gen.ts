import path from 'node:path';
import fs from 'node:fs/promises';
import { getLogger } from '@jay-framework/logger';

export interface KeyedPartInfo {
    key: string;
    modulePath: string;
    exportName: string;
}

export interface HydrationEntryOptions {
    jayHtmlPath: string;
    pageModulePath: string;
    pageExportName?: string;
    slowViewState: object;
    trackByMap: Record<string, string>;
    outputPath: string;
    keyedParts?: KeyedPartInfo[];
}

export async function generateHydrationEntry(
    options: HydrationEntryOptions,
): Promise<void> {
    const {
        jayHtmlPath,
        pageModulePath,
        pageExportName = 'page',
        slowViewState,
        trackByMap,
        outputPath,
        keyedParts = [],
    } = options;

    const hydrateImport = `${jayHtmlPath}?jay-hydrate`;

    const partImports = keyedParts.map(
        (p, i) => `import { ${p.exportName} as keyedPart${i} } from '${p.modulePath}';`,
    ).join('\n');

    const hasPageModule = pageModulePath && pageExportName;
    const pagePartExpr = hasPageModule
        ? `pagePart && pagePart.comp ? { comp: pagePart.comp, contextMarkers: pagePart.contexts || [] } : null`
        : `null`;
    const partsArray = [
        pagePartExpr,
        ...keyedParts.map(
            (p, i) => `keyedPart${i} && keyedPart${i}.comp ? { comp: keyedPart${i}.comp, contextMarkers: keyedPart${i}.contexts || [], key: '${p.key}' } : null`,
        ),
    ];

    const pageImport = hasPageModule
        ? `import { ${pageExportName} as pagePart } from '${pageModulePath}';`
        : '';

    const code = `import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { hydrate } from '${hydrateImport}';
${pageImport}
${partImports}

const slowViewState = ${JSON.stringify(slowViewState)};
const trackByMap = ${JSON.stringify(trackByMap)};

export function init(fastViewState, fastCarryForward) {
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
