/**
 * References handler for design-system-validator plugin.
 *
 * Runs during `jay-stack agent-kit` to generate AIditor add-menu entries
 * from the project's DESIGN.md tokens — one item per design token, with HTML previews.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import type { AddMenuItem } from '@jay-framework/plugin-validator';
import yaml from 'js-yaml';

import {
    buildAnimationItems,
    buildBreakpointItems,
    buildColorItems,
    buildComponentItems,
    buildRoundedItems,
    buildSpacingItems,
    buildTypographyItems,
} from './add-menu-item-builders.js';
import { writeAddMenuCatalog, ADD_MENU_GENERATED_REL } from './add-menu-catalog-io.js';
import { materializeDesignSystemAiditorSettings } from './aiditor/write-settings-contribution.js';
import { findAllDesignMdFiles } from './design-md-files.js';
import { parseDesignMd } from './parse-design-md.js';

export { ADD_MENU_GENERATED_REL } from './add-menu-catalog-io.js';

function categoryName(designMdPath: string, projectRoot: string, tokens: { name?: string }): string {
    if (tokens.name) return tokens.name;
    const rel = path.relative(projectRoot, designMdPath);
    if (rel === 'DESIGN.md') return 'Design System';
    const dir = path.dirname(rel).replace(/^src\/pages\/?/, '');
    return dir ? `Design System (${dir})` : 'Design System';
}

export async function generateDesignSystemAgentKit(
    ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
    const designMdFiles = findAllDesignMdFiles(ctx.projectRoot);

    const settingsGenerated = materializeDesignSystemAiditorSettings(ctx.projectRoot, ctx.force);

    if (designMdFiles.length === 0) {
        return {
            agentKitCreated: settingsGenerated ? [settingsGenerated] : [],
            message: settingsGenerated
                ? 'AIditor settings materialized; no DESIGN.md found for add-menu'
                : 'No DESIGN.md found in project',
        };
    }

    const allItems: AddMenuItem[] = [];
    const seen = new Set<string>();

    for (const filePath of designMdFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const tokens = parseDesignMd(content);
        if (!tokens) continue;

        const category = categoryName(filePath, ctx.projectRoot, tokens);

        const items = [
            ...buildColorItems(tokens, category),
            ...buildTypographyItems(tokens, category),
            ...buildSpacingItems(tokens, category),
            ...buildRoundedItems(tokens, category),
            ...buildBreakpointItems(tokens, category),
            ...buildAnimationItems(tokens, category),
            ...buildComponentItems(tokens, category),
        ];

        for (const item of items) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                allItems.push(item);
            }
        }
    }

    if (allItems.length === 0) {
        return {
            agentKitCreated: settingsGenerated ? [settingsGenerated] : [],
            message: 'DESIGN.md found but no tokens defined',
        };
    }

    writeAddMenuCatalog(ctx.projectRoot, allItems);

    const agentKitCreated = [ADD_MENU_GENERATED_REL];
    if (settingsGenerated) {
        agentKitCreated.push(settingsGenerated);
    }

    return {
        agentKitCreated,
        message: `Generated ${allItems.length} add-menu items from ${designMdFiles.length} DESIGN.md file(s)`,
    };
}

/** @internal — used by settings-actions when saving edited catalog */
export function dumpAddMenuCatalogYaml(items: AddMenuItem[]): string {
    return yaml.dump({ items }, { lineWidth: 120, noRefs: true });
}
