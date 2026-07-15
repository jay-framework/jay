import type { TypographyToken, ComponentSpec, AnimationPreset } from './parse-design-md.js';

export interface MatchResult {
    matches: boolean;
    suggestion?: string;
}

function normalizeHex(color: string): string | null {
    const hex = color.trim().toLowerCase();
    if (!/^#[0-9a-f]{3,8}$/.test(hex)) return null;
    if (hex.length === 4) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return hex.length === 7 ? hex : null;
}

function parseRgb(value: string): string | null {
    const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function normalizeColor(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('#')) return normalizeHex(trimmed);
    if (trimmed.startsWith('rgb')) return parseRgb(trimmed);
    return null;
}

const COLOR_PROPERTIES = new Set([
    'color',
    'background-color',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
    'text-decoration-color',
    'fill',
    'stroke',
]);

const SPACING_PROPERTIES = new Set([
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'top',
    'right',
    'bottom',
    'left',
]);

const RADIUS_PROPERTIES = new Set([
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
]);

export function isColorProperty(property: string): boolean {
    return COLOR_PROPERTIES.has(property);
}

export function isSpacingProperty(property: string): boolean {
    return SPACING_PROPERTIES.has(property);
}

export function isRadiusProperty(property: string): boolean {
    return RADIUS_PROPERTIES.has(property);
}

export function isTypographyProperty(property: string): boolean {
    return (
        property === 'font-size' ||
        property === 'font-weight' ||
        property === 'line-height' ||
        property === 'letter-spacing' ||
        property === 'font-family'
    );
}

export function isAnimationDurationProperty(property: string): boolean {
    return property === 'transition-duration' || property === 'animation-duration';
}

export function isAnimationEasingProperty(property: string): boolean {
    return property === 'transition-timing-function' || property === 'animation-timing-function';
}

export function matchColor(value: string, colorTokens: Record<string, string>): MatchResult {
    if (value.startsWith('var(')) return { matches: true };
    if (
        value === 'transparent' ||
        value === 'inherit' ||
        value === 'currentColor' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const normalized = normalizeColor(value);
    if (!normalized) return { matches: true };

    const tokenEntries = Object.entries(colorTokens);
    for (const [name, tokenValue] of tokenEntries) {
        const normalizedToken = normalizeColor(tokenValue);
        if (normalizedToken === normalized) return { matches: true };
    }

    let closestName = '';
    let closestDist = Infinity;
    for (const [name, tokenValue] of tokenEntries) {
        const nt = normalizeColor(tokenValue);
        if (!nt) continue;
        const dist = colorDistance(normalized, nt);
        if (dist < closestDist) {
            closestDist = dist;
            closestName = name;
        }
    }

    const suggestion = closestName
        ? `Use token {colors.${closestName}} ("${colorTokens[closestName]}")`
        : 'Add this color to DESIGN.md colors section';

    return { matches: false, suggestion };
}

function colorDistance(a: string, b: string): number {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

export function matchSpacing(value: string, spacingTokens: Record<string, string>): MatchResult {
    if (
        value.startsWith('var(') ||
        value === 'auto' ||
        value === '0' ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const parts = value.split(/\s+/);
    const tokenValues = new Set(Object.values(spacingTokens));
    tokenValues.add('0');

    for (const part of parts) {
        if (part === '0' || part === 'auto' || part.startsWith('var(')) continue;
        if (!tokenValues.has(part)) {
            return {
                matches: false,
                suggestion: `Use a DESIGN.md spacing token`,
            };
        }
    }

    return { matches: true };
}

export function matchRounded(value: string, roundedTokens: Record<string, string>): MatchResult {
    if (
        value.startsWith('var(') ||
        value === '0' ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const tokenValues = new Set(Object.values(roundedTokens));
    tokenValues.add('0');

    if (!tokenValues.has(value)) {
        return {
            matches: false,
            suggestion: `Use a DESIGN.md rounded token`,
        };
    }

    return { matches: true };
}

export function matchTypographyProperty(
    property: string,
    value: string,
    typographyTokens: Record<string, TypographyToken>,
): MatchResult {
    if (
        value.startsWith('var(') ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const tokenValues = new Set<string>();
    for (const token of Object.values(typographyTokens)) {
        if (property === 'font-size' && token.fontSize) tokenValues.add(token.fontSize);
        if (property === 'font-weight' && token.fontWeight != null)
            tokenValues.add(String(token.fontWeight));
        if (property === 'line-height' && token.lineHeight != null)
            tokenValues.add(String(token.lineHeight));
        if (property === 'letter-spacing' && token.letterSpacing)
            tokenValues.add(token.letterSpacing);
        if (property === 'font-family' && token.fontFamily) tokenValues.add(token.fontFamily);
    }

    if (tokenValues.size === 0) return { matches: true };
    if (tokenValues.has(value)) return { matches: true };

    if (property === 'font-family') {
        const normalizedValue = value.replace(/['"]/g, '').trim();
        const primaryFont = normalizedValue.split(',')[0].trim();
        for (const tv of tokenValues) {
            if (tv.replace(/['"]/g, '').trim() === primaryFont) return { matches: true };
        }
    }

    return {
        matches: false,
        suggestion: `Use a DESIGN.md typography token`,
    };
}

export function matchAnimationDuration(
    value: string,
    animationTokens: Record<string, AnimationPreset>,
): MatchResult {
    if (
        value.startsWith('var(') ||
        value === '0s' ||
        value === '0ms' ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const durations = new Set<string>();
    for (const preset of Object.values(animationTokens)) {
        if (preset.duration) durations.add(preset.duration);
    }

    if (durations.size === 0) return { matches: true };
    if (durations.has(value)) return { matches: true };

    return {
        matches: false,
        suggestion: `Use a DESIGN.md animation preset duration`,
    };
}

export function matchAnimationEasing(
    value: string,
    animationTokens: Record<string, AnimationPreset>,
): MatchResult {
    if (
        value.startsWith('var(') ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return { matches: true };
    }

    const easings = new Set<string>();
    for (const preset of Object.values(animationTokens)) {
        if (preset.easing) easings.add(preset.easing);
    }

    if (easings.size === 0) return { matches: true };
    if (easings.has(value)) return { matches: true };

    const normalizedValue = value.replace(/\s/g, '');
    for (const e of easings) {
        if (e.replace(/\s/g, '') === normalizedValue) return { matches: true };
    }

    return {
        matches: false,
        suggestion: `Use a DESIGN.md animation preset easing`,
    };
}

export interface ComponentMismatch {
    cssProp: string;
    expected: string;
    expectedRaw?: string;
    actual: string;
}

export function matchComponent(
    elementStyles: Record<string, string>,
    componentSpec: ComponentSpec,
    rawSpec?: ComponentSpec,
): ComponentMismatch[] {
    const mismatches: ComponentMismatch[] = [];

    const propertyMapping: Record<string, string> = {
        backgroundColor: 'background-color',
        textColor: 'color',
        rounded: 'border-radius',
        padding: 'padding',
        height: 'height',
        width: 'width',
    };

    for (const [specProp, expectedValue] of Object.entries(componentSpec)) {
        if (specProp === 'typography') continue;
        const cssProp = propertyMapping[specProp] || specProp;
        const actualValue = elementStyles[cssProp];

        if (actualValue && actualValue !== expectedValue) {
            const rawValue = rawSpec?.[specProp];
            mismatches.push({
                cssProp,
                expected: expectedValue,
                expectedRaw: rawValue !== expectedValue ? rawValue : undefined,
                actual: actualValue,
            });
        }
    }

    return mismatches;
}

export function formatComponentMismatches(
    componentName: string,
    mismatches: ComponentMismatch[],
    elementDescription?: string,
): string {
    const specPath = `DESIGN.md components.${componentName}`;
    const header = elementDescription ? `${specPath} on ${elementDescription}:` : `${specPath}:`;
    const lines: string[] = [header];
    for (let i = 0; i < mismatches.length; i++) {
        const m = mismatches[i];
        const expectedDisplay = m.expectedRaw
            ? `${m.expectedRaw} (${m.expected})`
            : `"${m.expected}"`;
        lines.push(`  ${i + 1}. ${m.cssProp} should be ${expectedDisplay}, found "${m.actual}"`);
    }
    return lines.join('\n');
}

export function isBackgroundShorthand(property: string): boolean {
    return property === 'background';
}

function splitTopLevelCommas(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

export function extractBackgroundColors(value: string): string[] {
    if (
        value.startsWith('var(') ||
        value === 'transparent' ||
        value === 'none' ||
        value === 'inherit' ||
        value === 'initial' ||
        value === 'unset'
    ) {
        return [];
    }

    const layers = splitTopLevelCommas(value);
    const colors: string[] = [];

    for (const layer of layers) {
        if (/^(linear-gradient|radial-gradient|conic-gradient|repeating-|url)\s*\(/i.test(layer)) {
            continue;
        }

        const hexMatch = layer.match(/(^|\s)(#[0-9a-fA-F]{3,8})(\s|$)/);
        if (hexMatch) {
            colors.push(hexMatch[2]);
            continue;
        }

        const rgbMatch = layer.match(/(^|\s)(rgba?\s*\([^)]+\))/);
        if (rgbMatch) {
            colors.push(rgbMatch[2]);
        }
    }

    return colors;
}

export function hexToRgbValues(hex: string): [number, number, number] | null {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;
    return [
        parseInt(normalized.slice(1, 3), 16),
        parseInt(normalized.slice(3, 5), 16),
        parseInt(normalized.slice(5, 7), 16),
    ];
}

export function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(l1: number, l2: number): number {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
