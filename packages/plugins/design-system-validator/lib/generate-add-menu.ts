/**
 * References handler for design-system-validator plugin.
 *
 * Runs during `jay-stack agent-kit` to generate AIditor add-menu entries
 * from the project's DESIGN.md tokens.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    PluginReferencesContext,
    PluginReferencesResult,
} from '@jay-framework/stack-server-runtime';
import { parseDesignMd, type DesignTokens } from './parse-design-md.js';
import yaml from 'js-yaml';

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/design-system.yaml';

interface AddMenuItem {
    id: string;
    title: string;
    category: string;
    subCategory: string;
    prompt: string;
}

function buildColorItems(tokens: DesignTokens): AddMenuItem[] {
    const entries = Object.entries(tokens.colors);
    if (entries.length === 0) return [];

    const palette = entries.map(([name, value]) => `${name}: ${value}`).join(', ');

    return [
        {
            id: 'design-system:color-palette',
            title: 'Color palette',
            category: 'Design System',
            subCategory: 'Colors',
            prompt: `Apply colors from the project design system.\nAvailable color tokens: ${palette}.\nUse the exact token values from DESIGN.md. Do not use hardcoded colors outside this palette.`,
        },
    ];
}

function buildTypographyItems(tokens: DesignTokens): AddMenuItem[] {
    const entries = Object.entries(tokens.typography);
    if (entries.length === 0) return [];

    const presets = entries
        .map(([name, t]) => {
            const parts = [`${name}:`];
            if (t.fontFamily) parts.push(t.fontFamily);
            if (t.fontSize) parts.push(t.fontSize);
            if (t.fontWeight) parts.push(`weight ${t.fontWeight}`);
            return parts.join(' ');
        })
        .join('; ');

    return [
        {
            id: 'design-system:typography',
            title: 'Typography presets',
            category: 'Design System',
            subCategory: 'Typography',
            prompt: `Apply typography from the project design system.\nAvailable presets: ${presets}.\nUse font-size, font-weight, line-height, and font-family values from these presets. Do not introduce typography values outside the design system.`,
        },
    ];
}

function buildSpacingItems(tokens: DesignTokens): AddMenuItem[] {
    const entries = Object.entries(tokens.spacing);
    if (entries.length === 0) return [];

    const scale = entries.map(([name, value]) => `${name}: ${value}`).join(', ');

    return [
        {
            id: 'design-system:spacing',
            title: 'Spacing scale',
            category: 'Design System',
            subCategory: 'Layout',
            prompt: `Apply spacing from the project design system.\nSpacing scale: ${scale}.\nUse these values for padding, margin, and gap. Add /* design-system: allow */ comment to exempt intentional one-off values.`,
        },
    ];
}

function buildRoundedItems(tokens: DesignTokens): AddMenuItem[] {
    const entries = Object.entries(tokens.rounded);
    if (entries.length === 0) return [];

    const scale = entries.map(([name, value]) => `${name}: ${value}`).join(', ');

    return [
        {
            id: 'design-system:rounded',
            title: 'Border radius',
            category: 'Design System',
            subCategory: 'Shapes',
            prompt: `Apply border-radius from the project design system.\nRounded scale: ${scale}.\nUse these values for border-radius. Do not use arbitrary radius values.`,
        },
    ];
}

function buildComponentItems(tokens: DesignTokens): AddMenuItem[] {
    const entries = Object.entries(tokens.components);
    if (entries.length === 0) return [];

    return entries.map(([name, spec]) => {
        const props = Object.entries(spec)
            .map(([prop, value]) => `${prop}: ${value}`)
            .join(', ');

        const isJayComponent = name.startsWith('jay:');
        const title = isJayComponent ? name : `Component: ${name}`;

        return {
            id: `design-system:component-${name}`,
            title,
            category: 'Design System',
            subCategory: 'Components',
            prompt: `Apply the "${name}" component spec from the design system.\nRequired styles: ${props}.\nEnsure the element matches these values exactly. The design-system validator will flag mismatches.`,
        };
    });
}

function findAllDesignMdFiles(projectRoot: string): string[] {
    const pagesRoot = path.join(projectRoot, 'src', 'pages');
    const files: string[] = [];

    const rootDesignMd = path.join(projectRoot, 'DESIGN.md');
    if (fs.existsSync(rootDesignMd)) files.push(rootDesignMd);

    if (fs.existsSync(pagesRoot)) {
        function walk(dir: string) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isFile() && entry.name === 'DESIGN.md') {
                    files.push(path.join(dir, entry.name));
                } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    walk(path.join(dir, entry.name));
                }
            }
        }
        walk(pagesRoot);
    }

    return files;
}

export async function generateDesignSystemReferences(
    ctx: PluginReferencesContext,
): Promise<PluginReferencesResult> {
    const designMdFiles = findAllDesignMdFiles(ctx.projectRoot);

    if (designMdFiles.length === 0) {
        return { referencesCreated: [], message: 'No DESIGN.md found in project' };
    }

    const allItems: AddMenuItem[] = [];
    const seen = new Set<string>();

    for (const filePath of designMdFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const tokens = parseDesignMd(content);
        if (!tokens) continue;

        const items = [
            ...buildColorItems(tokens),
            ...buildTypographyItems(tokens),
            ...buildSpacingItems(tokens),
            ...buildRoundedItems(tokens),
            ...buildComponentItems(tokens),
        ];

        for (const item of items) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                allItems.push(item);
            }
        }
    }

    if (allItems.length === 0) {
        return { referencesCreated: [], message: 'DESIGN.md found but no tokens defined' };
    }

    const outputPath = path.join(ctx.projectRoot, ADD_MENU_OUTPUT_REL);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, yaml.dump({ items: allItems }, { lineWidth: 120 }), 'utf-8');

    return {
        referencesCreated: [ADD_MENU_OUTPUT_REL],
        message: `Generated ${allItems.length} add-menu items from DESIGN.md tokens`,
    };
}
