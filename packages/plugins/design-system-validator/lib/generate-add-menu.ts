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
import { parseDesignMd, type DesignTokens } from './parse-design-md.js';
import yaml from 'js-yaml';

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/design-system.yaml';
const PLUGIN_ATTRS = {
    pluginName: 'design-system-validator',
    packageName: '@jay-framework/design-system-validator',
};

function categoryName(designMdPath: string, projectRoot: string, tokens: DesignTokens): string {
    if (tokens.name) return tokens.name;
    const rel = path.relative(projectRoot, designMdPath);
    if (rel === 'DESIGN.md') return 'Design System';
    const dir = path.dirname(rel).replace(/^src\/pages\/?/, '');
    return dir ? `Design System (${dir})` : 'Design System';
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isLargeFontSize(fontSize?: string): boolean {
    if (!fontSize) return false;
    // vw/vh units are typically heading-scale
    if (/\d+(\.\d+)?\s*(vw|vh|vmin|vmax)\b/.test(fontSize)) return true;
    // clamp() with a large max value
    const clampMatch = fontSize.match(/clamp\([^,]+,[^,]+,\s*([\d.]+)\s*(px|rem|em)/);
    if (clampMatch) {
        const max = parseFloat(clampMatch[1]);
        const unit = clampMatch[2];
        if (unit === 'px') return max > 20;
        return max > 1.25; // rem/em
    }
    // Simple px/rem/em values
    const simple = parseFloat(fontSize);
    if (isNaN(simple)) return false;
    if (fontSize.includes('rem') || fontSize.includes('em')) return simple > 1.25;
    return simple > 20;
}

function scopedFragment(innerHtml: string, scopedCss: string = ''): string {
    const styleBlock = `<style>@scope { ${scopedCss} }</style>`;
    return `<div>${styleBlock}${innerHtml}</div>`;
}

function buildColorItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.colors).map(([name, value]) => ({
        id: `design-system:color-${name}`,
        ...PLUGIN_ATTRS,
        title: name,
        category,
        subCategory: 'Colors',
        browse: { size: 'small' as const },
        prompt: `Use color token "${name}" with value ${value} from DESIGN.md.`,
        interaction: {
            mode: 'stage-place',
            stagePromptTemplate: `Apply the color token "${name}" (${value}) from DESIGN.md at this location.`,
        },
        presentation: {
            type: 'html-fragment',
            html: scopedFragment(`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:sans-serif;height:100%;">
  <div style="width:40px;height:40px;border-radius:6px;background:${esc(value)};border:1px solid rgba(0,0,0,0.1);"></div>
  <div style="font-size:10px;color:#888;font-family:monospace;">${esc(value)}</div>
</div>`),
        },
    }));
}

function buildTypographyItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.typography).map(([name, t]) => {
        const parts: string[] = [];
        if (t.fontFamily) parts.push(t.fontFamily);
        if (t.fontSize) parts.push(t.fontSize);
        if (t.fontWeight) parts.push(`weight ${t.fontWeight}`);
        if (t.lineHeight) parts.push(`line-height ${t.lineHeight}`);
        if (t.letterSpacing) parts.push(`letter-spacing ${t.letterSpacing}`);
        const desc = parts.join(', ');

        const styles: string[] = [];
        if (t.fontFamily) styles.push(`font-family:${t.fontFamily},sans-serif`);
        if (t.fontSize) styles.push(`font-size:${t.fontSize}`);
        if (t.fontWeight) styles.push(`font-weight:${t.fontWeight}`);
        if (t.lineHeight) styles.push(`line-height:${t.lineHeight}`);
        if (t.letterSpacing) styles.push(`letter-spacing:${t.letterSpacing}`);

        const isLargeFont = isLargeFontSize(t.fontSize);

        return {
            id: `design-system:typography-${name}`,
            ...PLUGIN_ATTRS,
            title: name,
            category,
            subCategory: 'Typography',
            prompt: `Apply typography preset "${name}" from DESIGN.md: ${desc}.`,
            interaction: {
                mode: 'stage-place',
                stagePromptTemplate: `Apply the typography preset "${name}" (${desc}) from DESIGN.md at this location.`,
            },
            ...(isLargeFont ? { browse: { size: 'large' as const } } : {}),
            presentation: {
                type: 'html-fragment',
                html: scopedFragment(`<div style="font-family:sans-serif;">
  <div style="${styles.join(';')};margin:0;">The quick brown fox</div>
  <div style="font-size:10px;color:#888;margin-top:6px;font-family:monospace;">${esc(name)}: ${esc(desc)}</div>
</div>`),
            },
        };
    });
}

function spacingBrowseSize(value: string): 'small' | 'large' | undefined {
    if (/calc|clamp|var\(/.test(value)) return 'large';
    const px = parseFloat(value);
    if (!isNaN(px) && !value.includes('rem') && !value.includes('em')) {
        if (px <= 30) return 'small';
        if (px > 100) return 'large';
        return undefined;
    }
    // rem/em: ≤2rem → small, >6rem → large
    const rem = parseFloat(value);
    if (!isNaN(rem)) {
        if (rem <= 2) return 'small';
        if (rem > 6) return 'large';
    }
    return undefined;
}

function buildSpacingItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.spacing).map(([name, value]) => ({
        id: `design-system:spacing-${name}`,
        ...PLUGIN_ATTRS,
        title: name,
        category,
        subCategory: 'Spacing',
        prompt: `Use spacing token "${name}" with value ${value} from DESIGN.md for padding, margin, or gap.`,
        ...(spacingBrowseSize(value) ? { browse: { size: spacingBrowseSize(value)! } } : {}),
        interaction: {
            mode: 'stage-place',
            stagePromptTemplate: `Apply the spacing token "${name}" (${value}) from DESIGN.md at this location.`,
        },
        presentation: {
            type: 'html-fragment',
            html: scopedFragment(`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:sans-serif;height:100%;">
  <div style="display:flex;align-items:center;gap:0;">
    <div style="width:16px;height:24px;background:#cbd5e1;border-radius:2px 0 0 2px;"></div>
    <div style="width:${esc(value)};height:24px;background:repeating-linear-gradient(45deg,#e0f2fe,#e0f2fe 2px,#bae6fd 2px,#bae6fd 4px);"></div>
    <div style="width:16px;height:24px;background:#cbd5e1;border-radius:0 2px 2px 0;"></div>
  </div>
  <div style="font-size:10px;color:#888;font-family:monospace;">${esc(value)}</div>
</div>`),
        },
    }));
}

function buildRoundedItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.rounded).map(([name, value]) => ({
        id: `design-system:rounded-${name}`,
        ...PLUGIN_ATTRS,
        title: name,
        category,
        subCategory: 'Rounded',
        browse: { size: 'small' as const },
        prompt: `Use border-radius token "${name}" with value ${value} from DESIGN.md.`,
        interaction: {
            mode: 'stage-place',
            stagePromptTemplate: `Apply the border-radius token "${name}" (${value}) from DESIGN.md at this location.`,
        },
        presentation: {
            type: 'html-fragment',
            html: scopedFragment(`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:sans-serif;height:100%;">
  <div style="width:40px;height:40px;border-radius:${esc(value)};background:#e2e8f0;border:1.5px solid #94a3b8;"></div>
  <div style="font-size:10px;color:#888;font-family:monospace;">${esc(value)}</div>
</div>`),
        },
    }));
}

function buildBreakpointItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.breakpoints).map(([name, value]) => ({
        id: `design-system:breakpoint-${name}`,
        ...PLUGIN_ATTRS,
        title: `${name} (${value})`,
        category,
        subCategory: 'Breakpoints',
        prompt: `Use breakpoint "${name}" at max-width ${value} from DESIGN.MD: @media (max-width: ${value}) { ... }`,
        interaction: {
            mode: 'stage-place',
            stagePromptTemplate: `Add a responsive breakpoint at "${name}" (${value}) from DESIGN.md for this element.`,
        },
    }));
}

function buildAnimationItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.animations).map(([name, preset]) => {
        const parts: string[] = [];
        if (preset.duration) parts.push(preset.duration);
        if (preset.easing) parts.push(preset.easing);
        const desc = parts.join(', ');

        const dur = preset.duration || '300ms';
        const ease = preset.easing || 'ease';

        return {
            id: `design-system:animation-${name}`,
            ...PLUGIN_ATTRS,
            title: name,
            category,
            subCategory: 'Animations',
            prompt: `Use animation preset "${name}" from DESIGN.md: ${desc}. Apply to transition-duration and transition-timing-function.`,
            interaction: {
                mode: 'stage-place',
                stagePromptTemplate: `Apply the animation preset "${name}" (${desc}) from DESIGN.md to this element's transitions.`,
            },
            presentation: {
                type: 'html-fragment',
                html: scopedFragment(
                    `<div style="display:flex;align-items:center;gap:10px;font-family:sans-serif;">
    <div class="anim-preview"></div>
    <div>
      <div style="font-size:12px;font-weight:600;">${esc(name)}</div>
      <div style="font-size:11px;color:#888;font-family:monospace;">${esc(desc)}</div>
      <div style="font-size:10px;color:#aaa;">hover to preview</div>
    </div>
  </div>`,
                    `.anim-preview { width:40px;height:40px;border-radius:6px;background:#8b5cf6;transition:transform ${esc(dur)} ${esc(ease)};cursor:pointer; } .anim-preview:hover { transform:scale(1.3); }`,
                ),
            },
        };
    });
}

function buildComponentItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.components).map(([name, spec]) => {
        const rawSpec = tokens.rawComponents[name];
        const props = Object.entries(spec)
            .map(([prop, value]) => {
                const raw = rawSpec?.[prop];
                return raw && raw !== value ? `${prop}: ${raw} (${value})` : `${prop}: ${value}`;
            })
            .join(', ');

        const previewStyles: string[] = [];
        const propertyMapping: Record<string, string> = {
            backgroundColor: 'background-color',
            textColor: 'color',
            rounded: 'border-radius',
            padding: 'padding',
            borderColor: 'border-color',
        };
        for (const [prop, value] of Object.entries(spec)) {
            if (prop === 'typography') continue;
            const cssProp = propertyMapping[prop] || prop;
            previewStyles.push(`${cssProp}:${value}`);
        }
        if (!spec.padding) previewStyles.push('padding:8px 16px');
        if (spec.borderColor) previewStyles.push('border:1.5px solid ' + spec.borderColor);

        return {
            id: `design-system:component-${name}`,
            ...PLUGIN_ATTRS,
            title: name,
            category,
            subCategory: 'Components',
            prompt: `Apply the "${name}" component spec from DESIGN.md. Required styles: ${props}. The design-system validator will flag mismatches.`,
            interaction: {
                mode: 'stage-place',
                stagePromptTemplate: `Apply the "${name}" component styles (${props}) from DESIGN.md to this element.`,
            },
            presentation: {
                type: 'html-fragment',
                html: scopedFragment(`<div style="font-family:sans-serif;">
  <div style="${previewStyles.join(';')};display:inline-block;font-size:13px;min-width:80px;text-align:center;">${esc(name)}</div>
  <div style="font-size:10px;color:#888;margin-top:6px;font-family:monospace;">${esc(props)}</div>
</div>`),
            },
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

export async function generateDesignSystemAgentKit(
    ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
    const designMdFiles = findAllDesignMdFiles(ctx.projectRoot);

    if (designMdFiles.length === 0) {
        return { agentKitCreated: [], message: 'No DESIGN.md found in project' };
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
        return { agentKitCreated: [], message: 'DESIGN.md found but no tokens defined' };
    }

    const outputPath = path.join(ctx.projectRoot, ADD_MENU_OUTPUT_REL);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, yaml.dump({ items: allItems }, { lineWidth: 120, noRefs: true }), 'utf-8');

    return {
        agentKitCreated: [ADD_MENU_OUTPUT_REL],
        message: `Generated ${allItems.length} add-menu items from ${designMdFiles.length} DESIGN.md file(s)`,
    };
}
