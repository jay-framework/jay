/**
 * References handler for design-system-validator plugin.
 *
 * Runs during `jay-stack agent-kit` to generate AIditor add-menu entries
 * from the project's DESIGN.md tokens — one item per design token, with HTML previews.
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
    html?: string;
}

function categoryName(designMdPath: string, projectRoot: string, tokens: DesignTokens): string {
    if (tokens.name) return tokens.name;
    const rel = path.relative(projectRoot, designMdPath);
    if (rel === 'DESIGN.md') return 'Design System';
    const dir = path.dirname(rel).replace(/^src\/pages\/?/, '');
    return dir ? `Design System (${dir})` : 'Design System';
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildColorItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.colors).map(([name, value]) => ({
        id: `design-system:color-${name}`,
        title: `${name} (${value})`,
        category,
        subCategory: 'Colors',
        prompt: `Use color token "${name}" with value ${value} from DESIGN.md.`,
        html: `<div style="display:flex;align-items:center;gap:10px;font-family:sans-serif;">
  <div style="width:40px;height:40px;border-radius:6px;background:${esc(value)};border:1px solid rgba(0,0,0,0.1);flex-shrink:0;"></div>
  <div>
    <div style="font-size:13px;font-weight:600;">${esc(name)}</div>
    <div style="font-size:11px;color:#888;font-family:monospace;">${esc(value)}</div>
  </div>
</div>`,
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

        return {
            id: `design-system:typography-${name}`,
            title: name,
            category,
            subCategory: 'Typography',
            prompt: `Apply typography preset "${name}" from DESIGN.md: ${desc}.`,
            html: `<div style="font-family:sans-serif;">
  <div style="${styles.join(';')};margin:0;">The quick brown fox</div>
  <div style="font-size:10px;color:#888;margin-top:6px;font-family:monospace;">${esc(name)}: ${esc(desc)}</div>
</div>`,
        };
    });
}

function buildSpacingItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.spacing).map(([name, value]) => ({
        id: `design-system:spacing-${name}`,
        title: `${name} (${value})`,
        category,
        subCategory: 'Spacing',
        prompt: `Use spacing token "${name}" with value ${value} from DESIGN.md for padding, margin, or gap.`,
        html: `<div style="display:flex;align-items:center;gap:8px;font-family:sans-serif;">
  <div style="display:flex;align-items:center;gap:0;">
    <div style="width:16px;height:24px;background:#cbd5e1;border-radius:2px 0 0 2px;"></div>
    <div style="width:${esc(value)};height:24px;background:repeating-linear-gradient(45deg,#e0f2fe,#e0f2fe 2px,#bae6fd 2px,#bae6fd 4px);"></div>
    <div style="width:16px;height:24px;background:#cbd5e1;border-radius:0 2px 2px 0;"></div>
  </div>
  <div>
    <span style="font-size:12px;font-weight:600;">${esc(name)}</span>
    <span style="font-size:11px;color:#888;font-family:monospace;margin-left:4px;">${esc(value)}</span>
  </div>
</div>`,
    }));
}

function buildRoundedItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.rounded).map(([name, value]) => ({
        id: `design-system:rounded-${name}`,
        title: `${name} (${value})`,
        category,
        subCategory: 'Rounded',
        prompt: `Use border-radius token "${name}" with value ${value} from DESIGN.md.`,
        html: `<div style="display:flex;align-items:center;gap:10px;font-family:sans-serif;">
  <div style="width:40px;height:40px;border-radius:${esc(value)};background:#e2e8f0;border:1.5px solid #94a3b8;flex-shrink:0;"></div>
  <div>
    <div style="font-size:12px;font-weight:600;">${esc(name)}</div>
    <div style="font-size:11px;color:#888;font-family:monospace;">${esc(value)}</div>
  </div>
</div>`,
    }));
}

function buildBreakpointItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.breakpoints).map(([name, value]) => ({
        id: `design-system:breakpoint-${name}`,
        title: `${name} (${value})`,
        category,
        subCategory: 'Breakpoints',
        prompt: `Use breakpoint "${name}" at max-width ${value} from DESIGN.md: @media (max-width: ${value}) { ... }`,
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
            title: name,
            category,
            subCategory: 'Animations',
            prompt: `Use animation preset "${name}" from DESIGN.md: ${desc}. Apply to transition-duration and transition-timing-function.`,
            html: `<div style="font-family:sans-serif;">
  <style>
    @scope {
      .anim-preview { width:40px;height:40px;border-radius:6px;background:#8b5cf6;transition:transform ${esc(dur)} ${esc(ease)};cursor:pointer; }
      .anim-preview:hover { transform:scale(1.3); }
    }
  </style>
  <div style="display:flex;align-items:center;gap:10px;">
    <div class="anim-preview"></div>
    <div>
      <div style="font-size:12px;font-weight:600;">${esc(name)}</div>
      <div style="font-size:11px;color:#888;font-family:monospace;">${esc(desc)}</div>
      <div style="font-size:10px;color:#aaa;">hover to preview</div>
    </div>
  </div>
</div>`,
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
            title: name,
            category,
            subCategory: 'Components',
            prompt: `Apply the "${name}" component spec from DESIGN.md. Required styles: ${props}. The design-system validator will flag mismatches.`,
            html: `<div style="font-family:sans-serif;">
  <div style="${previewStyles.join(';')};display:inline-block;font-size:13px;min-width:80px;text-align:center;">${esc(name)}</div>
  <div style="font-size:10px;color:#888;margin-top:6px;font-family:monospace;">${esc(props)}</div>
</div>`,
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
        return { referencesCreated: [], message: 'DESIGN.md found but no tokens defined' };
    }

    const outputPath = path.join(ctx.projectRoot, ADD_MENU_OUTPUT_REL);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, yaml.dump({ items: allItems }, { lineWidth: 120 }), 'utf-8');

    return {
        referencesCreated: [ADD_MENU_OUTPUT_REL],
        message: `Generated ${allItems.length} add-menu items from ${designMdFiles.length} DESIGN.md file(s)`,
    };
}
