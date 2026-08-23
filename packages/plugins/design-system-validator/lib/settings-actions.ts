import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';
import type { AddMenuItem } from '@jay-framework/plugin-validator';
import type { PluginAgentKitContext } from '@jay-framework/stack-server-runtime';

import { ADD_MENU_GENERATED_REL, generateDesignSystemAgentKit } from './generate-add-menu.js';
import { readAddMenuCatalog, writeAddMenuCatalog } from './add-menu-catalog-io.js';
import { findAllDesignMdFiles } from './design-md-files.js';
import { parseDesignMd } from './parse-design-md.js';
import { runDesignSystemAnalysis } from './run-design-analysis.js';

export type DesignMdSummary = {
    relativePath: string;
    name: string;
    colorCount: number;
    typographyCount: number;
    spacingCount: number;
    componentCount: number;
};

function countAddMenuItems(projectRoot: string): number {
    return readAddMenuCatalog(projectRoot).length;
}

function summarizeDesignMd(projectRoot: string, filePath: string): DesignMdSummary | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const tokens = parseDesignMd(content);
    if (!tokens) return null;

    const relativePath = path.relative(projectRoot, filePath);
    const name =
        tokens.name ??
        (relativePath === 'DESIGN.md'
            ? 'Design System'
            : `Design System (${path.dirname(relativePath)})`);

    return {
        relativePath,
        name,
        colorCount: Object.keys(tokens.colors).length,
        typographyCount: Object.keys(tokens.typography).length,
        spacingCount: Object.keys(tokens.spacing).length,
        componentCount: Object.keys(tokens.components).length,
    };
}

export const getDesignSystemSettingsStatus = makeJayQuery(
    'designSystem.getDesignSystemSettingsStatus',
).withHandler(async () => {
    const projectRoot = process.cwd();
    const designMdPaths = findAllDesignMdFiles(projectRoot);
    const designFiles = designMdPaths
        .map((filePath) => summarizeDesignMd(projectRoot, filePath))
        .filter((summary): summary is DesignMdSummary => summary !== null);

    return {
        hasDesignMd: designFiles.length > 0,
        designFiles,
        addMenuItemCount: countAddMenuItems(projectRoot),
        addMenuCatalogRel: ADD_MENU_GENERATED_REL,
        message:
            designFiles.length > 0
                ? `${designFiles.length} DESIGN.md file(s); ${countAddMenuItems(projectRoot)} Add Menu items.`
                : 'No DESIGN.md found — add one at the project root or under src/pages/.',
    };
});

export const runDesignSystemAnalysisAction = makeJayQuery(
    'designSystem.runDesignSystemAnalysis',
).withHandler(async () => {
    const projectRoot = process.cwd();
    return runDesignSystemAnalysis(projectRoot);
});

export const loadDesignSystemAddMenuCatalog = makeJayQuery(
    'designSystem.loadAddMenuCatalog',
).withHandler(async () => {
    const projectRoot = process.cwd();
    const items = readAddMenuCatalog(projectRoot);
    return {
        items,
        outputRel: ADD_MENU_GENERATED_REL,
        itemCount: items.length,
    };
});

export const saveDesignSystemAddMenuCatalog = makeJayAction(
    'designSystem.saveAddMenuCatalog',
).withHandler(async (input: { items: AddMenuItem[] }) => {
    const projectRoot = process.cwd();
    const outputRel = writeAddMenuCatalog(projectRoot, input.items);
    return {
        itemCount: input.items.length,
        outputRel,
        message: `Saved ${input.items.length} add-menu items to ${outputRel}.`,
    };
});

export const regenerateDesignSystemAddMenu = makeJayQuery(
    'designSystem.regenerateDesignSystemAddMenu',
).withHandler(async () => {
    const projectRoot = process.cwd();
    const ctx: PluginAgentKitContext = {
        pluginName: 'design-system-validator',
        projectRoot,
        referencesDir: path.join(projectRoot, 'agent-kit', 'references', 'design-system-validator'),
        services: new Map(),
        force: true,
    };

    const result = await generateDesignSystemAgentKit(ctx);
    const itemCount = countAddMenuItems(projectRoot);

    return {
        itemCount,
        outputRel: ADD_MENU_GENERATED_REL,
        agentKitCreated: result.agentKitCreated,
        message: result.message,
    };
});
