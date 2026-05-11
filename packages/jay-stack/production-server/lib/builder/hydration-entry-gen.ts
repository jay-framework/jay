import path from 'node:path';
import fs from 'node:fs/promises';
import { getLogger } from '@jay-framework/logger';

export interface HydrationEntryOptions {
    jayHtmlPath: string;
    pageModulePath: string;
    slowViewState: object;
    trackByMap: Record<string, string>;
    outputPath: string;
}

export async function generateHydrationEntry(
    options: HydrationEntryOptions,
): Promise<void> {
    const {
        jayHtmlPath,
        pageModulePath,
        slowViewState,
        trackByMap,
        outputPath,
    } = options;

    const hydrateImport = `${jayHtmlPath}?jay-hydrate`;

    const code = `import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { hydrate } from '${hydrateImport}';
import { page as pagePart } from '${pageModulePath}';

const slowViewState = ${JSON.stringify(slowViewState)};
const trackByMap = ${JSON.stringify(trackByMap)};

export function init(fastViewState, fastCarryForward) {
    const target = document.getElementById('target');
    const rootElement = target.firstElementChild;
    const parts = pagePart && pagePart.comp
        ? [{ comp: pagePart.comp, contexts: pagePart.contexts || [] }]
        : [];
    const pageComp = hydrateCompositeJayComponent(
        hydrate, slowViewState, fastViewState, fastCarryForward,
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
