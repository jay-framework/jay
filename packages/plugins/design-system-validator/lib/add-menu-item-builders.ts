import type { AddMenuItem } from '@jay-framework/plugin-validator';

import type { DesignTokens, TypographyToken } from './parse-design-md.js';

export const PLUGIN_ATTRS = {
    pluginName: 'design-system-validator',
    packageName: '@jay-framework/design-system-validator',
};

export function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function scopedFragment(innerHtml: string, scopedCss: string = ''): string {
    const styleBlock = `<style>@scope { ${scopedCss} }</style>`;
    return `<div>${styleBlock}${innerHtml}</div>`;
}

function isLargeFontSize(fontSize?: string): boolean {
    if (!fontSize) return false;
    if (/\d+(\.\d+)?\s*(vw|vh|vmin|vmax)\b/.test(fontSize)) return true;
    const clampMatch = fontSize.match(/clamp\([^,]+,[^,]+,\s*([\d.]+)\s*(px|rem|em)/);
    if (clampMatch) {
        const max = parseFloat(clampMatch[1]);
        const unit = clampMatch[2];
        if (unit === 'px') return max > 20;
        return max > 1.25;
    }
    const simple = parseFloat(fontSize);
    if (isNaN(simple)) return false;
    if (fontSize.includes('rem') || fontSize.includes('em')) return simple > 1.25;
    return simple > 20;
}

function spacingBrowseSize(value: string): 'small' | 'large' | undefined {
    if (/calc|clamp|var\(/.test(value)) return 'large';
    const px = parseFloat(value);
    if (!isNaN(px) && !value.includes('rem') && !value.includes('em')) {
        if (px <= 30) return 'small';
        if (px > 100) return 'large';
        return undefined;
    }
    const rem = parseFloat(value);
    if (!isNaN(rem)) {
        if (rem <= 2) return 'small';
        if (rem > 6) return 'large';
    }
    return undefined;
}

export function buildColorItem(name: string, value: string, category: string): AddMenuItem {
    return {
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
    };
}

export function buildSpacingItem(name: string, value: string, category: string): AddMenuItem {
    return {
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
    };
}

export function buildRoundedItem(name: string, value: string, category: string): AddMenuItem {
    return {
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
    };
}

function formatTypographyCssValue(value: string | number): string {
    return String(value);
}

export function buildTypographyItem(
    name: string,
    typography: TypographyToken,
    category: string,
): AddMenuItem {
    const parts: string[] = [];
    if (typography.fontFamily) parts.push(typography.fontFamily);
    if (typography.fontSize) parts.push(typography.fontSize);
    if (typography.fontWeight != null) {
        parts.push(`weight ${formatTypographyCssValue(typography.fontWeight)}`);
    }
    if (typography.lineHeight != null) {
        parts.push(`line-height ${formatTypographyCssValue(typography.lineHeight)}`);
    }
    if (typography.letterSpacing) parts.push(`letter-spacing ${typography.letterSpacing}`);
    const desc = parts.join(', ');

    const styles: string[] = [];
    if (typography.fontFamily) styles.push(`font-family:${typography.fontFamily},sans-serif`);
    if (typography.fontSize) styles.push(`font-size:${typography.fontSize}`);
    if (typography.fontWeight != null) {
        styles.push(`font-weight:${formatTypographyCssValue(typography.fontWeight)}`);
    }
    if (typography.lineHeight != null) {
        styles.push(`line-height:${formatTypographyCssValue(typography.lineHeight)}`);
    }
    if (typography.letterSpacing) styles.push(`letter-spacing:${typography.letterSpacing}`);

    const isLargeFont = isLargeFontSize(typography.fontSize);

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
}

export function buildColorItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.colors).map(([name, value]) =>
        buildColorItem(name, value, category),
    );
}

export function buildTypographyItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.typography).map(([name, typography]) =>
        buildTypographyItem(name, typography, category),
    );
}

export function buildSpacingItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.spacing).map(([name, value]) =>
        buildSpacingItem(name, value, category),
    );
}

export function buildRoundedItems(tokens: DesignTokens, category: string): AddMenuItem[] {
    return Object.entries(tokens.rounded).map(([name, value]) =>
        buildRoundedItem(name, value, category),
    );
}

export function buildBreakpointItems(tokens: DesignTokens, category: string): AddMenuItem[] {
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

export function buildAnimationItems(tokens: DesignTokens, category: string): AddMenuItem[] {
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

export function buildComponentItems(tokens: DesignTokens, category: string): AddMenuItem[] {
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
