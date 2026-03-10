import type { ImportIRLayoutMode, ImportIRStyle, ImportIREffect } from './import-ir';
import type { ComputedStyleData } from './computed-style-types';

const DYNAMIC_PATTERN = /\{[^}]*\}/;

const GRADIENT_PLACEHOLDER_COLOR = '#E8E4DD';

function parseGridColumnWidths(value: string): number[] | undefined {
    const cols: number[] = [];
    for (const token of value.split(/\s+/)) {
        const px = token.match(/^([\d.]+)px$/);
        if (px) cols.push(parseFloat(px[1]));
    }
    return cols.length > 0 ? cols : undefined;
}

export function parseInlineStyle(styleAttr: string): {
    parsed: Record<string, string>;
    dynamicProperties: string[];
} {
    const parsed: Record<string, string> = {};
    const dynamicProperties: string[] = [];

    if (!styleAttr) return { parsed, dynamicProperties };

    for (const declaration of styleAttr.split(';')) {
        const trimmed = declaration.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const prop = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        if (!prop || !value) continue;

        parsed[prop] = value;
        if (DYNAMIC_PATTERN.test(value)) {
            dynamicProperties.push(prop);
        }
    }

    return { parsed, dynamicProperties };
}

function parsePx(value: string): number | undefined {
    if (!value) return undefined;
    const match = value.match(/^([\d.]+)px$/);
    return match ? parseFloat(match[1]) : undefined;
}

function parseUnitless(value: string): number | undefined {
    if (!value) return undefined;
    const num = parseFloat(value);
    return !isNaN(num) ? num : undefined;
}

const RECOGNIZED_BUT_NOT_STORED = new Set([
    'box-sizing',
    'overflow-x',
    'overflow-y',
    'object-fit',
    'align-self',
    'border-style',
    'scrollbar-width',
    'scrollbar-color',
    '-webkit-backdrop-filter',
    'backdrop-filter',
    'filter',
    'transform',
    'transform-origin',
    'grid-auto-flow',
    'flex-shrink',
    'flex-basis',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
]);

function parseBoxShadow(value: string): ImportIREffect | undefined {
    // Parse: offsetX offsetY blurRadius [spreadRadius] color
    const match = value.match(/^([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s*(?:([\d.]+)px\s+)?(.+)$/);
    if (!match) return undefined;
    const [, xStr, yStr, blurStr, spreadStr, colorStr] = match;
    return {
        type: 'DROP_SHADOW',
        offset: { x: parseFloat(xStr), y: parseFloat(yStr) },
        radius: parseFloat(blurStr),
        spread: spreadStr ? parseFloat(spreadStr) : undefined,
        color: colorStr.trim(),
    };
}

export type CssClassMap = Map<string, Record<string, string>>;

export function parseCssToClassMap(cssText: string): { classMap: CssClassMap; warnings: string[] } {
    const classMap: CssClassMap = new Map();
    const warnings: string[] = [];
    if (!cssText) return { classMap, warnings };

    // Remove comments
    const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

    // Match rule blocks: selector { declarations }
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;

    while ((match = ruleRegex.exec(cleaned)) !== null) {
        const selectorGroup = match[1].trim();
        const declarations = match[2].trim();

        // Skip @-rules
        if (selectorGroup.startsWith('@')) {
            warnings.push(`CSS_AT_RULE_SKIPPED: ${selectorGroup.split('{')[0].trim()}`);
            continue;
        }

        for (const selector of selectorGroup.split(',')) {
            const sel = selector.trim();

            // Skip pseudo-class selectors
            if (sel.includes(':')) {
                warnings.push(`CSS_PSEUDO_NOT_SUPPORTED: ${sel}`);
                continue;
            }

            // Match simple class selectors: .foo or .foo.bar (compound)
            const classMatch = sel.match(/^(\.[a-zA-Z_-][\w-]*(?:\.[a-zA-Z_-][\w-]*)*)$/);
            if (!classMatch) {
                // Skip descendant selectors, element selectors, etc.
                if (sel.includes(' ') || sel.includes('>')) {
                    warnings.push(`CSS_COMPLEX_SELECTOR_SKIPPED: ${sel}`);
                }
                continue;
            }

            const classNames = classMatch[1].split('.').filter(Boolean);
            const key = classNames.sort().join('.');

            const props = classMap.get(key) ?? {};
            for (const decl of declarations.split(';')) {
                const trimmed = decl.trim();
                if (!trimmed) continue;
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx === -1) continue;
                const prop = trimmed.slice(0, colonIdx).trim();
                const val = trimmed.slice(colonIdx + 1).trim();
                if (prop && val) props[prop] = val;
            }
            classMap.set(key, props);
        }
    }
    return { classMap, warnings };
}

export function resolveClassStyles(
    classAttr: string,
    classMap: CssClassMap,
): Record<string, string> {
    const result: Record<string, string> = {};
    if (!classAttr || classMap.size === 0) return result;

    const classes = classAttr.split(/\s+/).filter(Boolean);
    // Single class lookups
    for (const cls of classes) {
        const props = classMap.get(cls);
        if (props) Object.assign(result, props);
    }
    // Compound class lookups (e.g., .foo.bar)
    if (classes.length > 1) {
        const compound = classes.sort().join('.');
        const props = classMap.get(compound);
        if (props) Object.assign(result, props);
    }
    return result;
}

export function resolveStyle(
    inlineStyle: string,
    classNames?: string[],
    cssClassMap?: CssClassMap,
    enrichedStyles?: ComputedStyleData,
): { style: ImportIRStyle; warnings: string[] } {
    const warnings: string[] = [];
    const style: ImportIRStyle = {};

    // Build merged style: class properties first, then inline overrides
    let mergedStyleStr = '';
    if (classNames && classNames.length > 0 && cssClassMap) {
        const classStyles = resolveClassStyles(classNames.join(' '), cssClassMap);
        mergedStyleStr = Object.entries(classStyles)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
    }
    if (inlineStyle) {
        mergedStyleStr = mergedStyleStr ? `${mergedStyleStr}; ${inlineStyle}` : inlineStyle;
    }

    // Apply computed styles if available (computed overrides static)
    if (enrichedStyles && enrichedStyles.styles) {
        const computedStyleStr = Object.entries(enrichedStyles.styles)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
        mergedStyleStr = mergedStyleStr
            ? `${mergedStyleStr}; ${computedStyleStr}`
            : computedStyleStr;
    }

    const { parsed, dynamicProperties } = parseInlineStyle(mergedStyleStr);

    for (const prop of dynamicProperties) {
        warnings.push(`CSS_DYNAMIC_VALUE: ${prop}`);
    }

    for (const [prop, value] of Object.entries(parsed)) {
        if (dynamicProperties.includes(prop)) continue;

        switch (prop) {
            case 'width': {
                const px = parsePx(value);
                if (px !== undefined) style.width = px;
                else if (value.includes('%'))
                    warnings.push(`CSS_UNSUPPORTED_UNIT: width: ${value}`);
                break;
            }
            case 'height': {
                const px = parsePx(value);
                if (px !== undefined) style.height = px;
                else if (value.includes('%'))
                    warnings.push(`CSS_UNSUPPORTED_UNIT: height: ${value}`);
                break;
            }
            case 'min-width': {
                const px = parsePx(value);
                if (px !== undefined) style.minWidth = px;
                break;
            }
            case 'min-height': {
                const px = parsePx(value);
                if (px !== undefined) style.minHeight = px;
                break;
            }
            case 'max-width': {
                const px = parsePx(value);
                if (px !== undefined) style.maxWidth = px;
                break;
            }
            case 'max-height': {
                const px = parsePx(value);
                if (px !== undefined) style.maxHeight = px;
                break;
            }
            case 'display':
                if (value === 'flex' || value === 'inline-flex') {
                    if (!style.layoutMode) style.layoutMode = 'row';
                } else if (value === 'grid' || value === 'inline-grid') {
                    style.layoutMode = 'grid';
                    const gridCols = parsed['grid-template-columns'];
                    if (gridCols) {
                        style.gridColumnWidths = parseGridColumnWidths(gridCols);
                    }
                    const gridRows = parsed['grid-template-rows'];
                    if (gridRows) {
                        style.gridRowHeights = parseGridColumnWidths(gridRows);
                    }
                } else if (value === 'block' || value === 'flow-root') {
                    if (!style.layoutMode) style.layoutMode = 'column';
                }
                break;
            case 'flex-direction': {
                const display = parsed['display'];
                const isFlex = display === 'flex' || display === 'inline-flex';
                if (!isFlex) break;
                if (value === 'column') style.layoutMode = 'column';
                else if (value === 'row') style.layoutMode = 'row';
                break;
            }
            case 'flex-wrap':
                if (value === 'wrap' || value === 'wrap-reverse') {
                    style.layoutWrap = true;
                }
                break;
            case 'gap': {
                const px = parsePx(value);
                if (px !== undefined) {
                    style.gap = px;
                    style.rowGap = px;
                }
                break;
            }
            case 'column-gap': {
                const px = parsePx(value);
                if (px !== undefined) style.gap = px;
                break;
            }
            case 'row-gap': {
                const px = parsePx(value);
                if (px !== undefined) style.rowGap = px;
                break;
            }
            case 'padding': {
                const parts = value.split(/\s+/).map((v) => parsePx(v));
                if (parts.length === 1 && parts[0] !== undefined) {
                    style.padding = {
                        top: parts[0],
                        right: parts[0],
                        bottom: parts[0],
                        left: parts[0],
                    };
                } else if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
                    style.padding = {
                        top: parts[0],
                        right: parts[1],
                        bottom: parts[0],
                        left: parts[1],
                    };
                } else if (parts.length === 3 && parts.every((p) => p !== undefined)) {
                    style.padding = {
                        top: parts[0]!,
                        right: parts[1]!,
                        bottom: parts[2]!,
                        left: parts[1]!,
                    };
                } else if (parts.length === 4 && parts.every((p) => p !== undefined)) {
                    style.padding = {
                        top: parts[0]!,
                        right: parts[1]!,
                        bottom: parts[2]!,
                        left: parts[3]!,
                    };
                }
                break;
            }
            case 'padding-top': {
                const px = parsePx(value);
                if (px !== undefined) {
                    const p = style.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
                    style.padding = { ...p, top: px };
                }
                break;
            }
            case 'padding-right': {
                const px = parsePx(value);
                if (px !== undefined) {
                    const p = style.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
                    style.padding = { ...p, right: px };
                }
                break;
            }
            case 'padding-bottom': {
                const px = parsePx(value);
                if (px !== undefined) {
                    const p = style.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
                    style.padding = { ...p, bottom: px };
                }
                break;
            }
            case 'padding-left': {
                const px = parsePx(value);
                if (px !== undefined) {
                    const p = style.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
                    style.padding = { ...p, left: px };
                }
                break;
            }
            case 'background-color':
                style.backgroundColor = value;
                break;
            case 'background-image': {
                if (value === 'none') break;
                const solidGradient = value.match(
                    /^linear-gradient\(rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\),\s*rgba\(\1,\s*\2,\s*\3,\s*\4\)\)$/,
                );
                if (solidGradient) {
                    const [, rs, gs, bs, as] = solidGradient;
                    const r = parseInt(rs, 10);
                    const g = parseInt(gs, 10);
                    const b = parseInt(bs, 10);
                    const a = parseFloat(as);
                    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    if (a < 1) {
                        style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
                    } else {
                        style.backgroundColor = hex;
                    }
                } else if (value.includes('gradient')) {
                    if (!style.backgroundColor || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                        style.backgroundColor = GRADIENT_PLACEHOLDER_COLOR;
                    }
                }
                break;
            }
            case 'background-size':
            case 'background-position':
            case 'background-repeat':
            case 'background':
                break;
            case 'color':
                style.textColor = value;
                break;
            case 'font-family':
                style.fontFamily = value
                    .split(',')[0]
                    .trim()
                    .replace(/^['"]|['"]$/g, '');
                break;
            case 'font-size': {
                const px = parsePx(value);
                if (px !== undefined) style.fontSize = px;
                break;
            }
            case 'font-weight': {
                const num = parseInt(value, 10);
                if (!isNaN(num)) style.fontWeight = num;
                else if (value === 'bold') style.fontWeight = 700;
                else if (value === 'normal') style.fontWeight = 400;
                break;
            }
            case 'line-height': {
                const px = parsePx(value);
                const unitless = parseUnitless(value);
                if (px !== undefined) style.lineHeight = px;
                else if (unitless !== undefined) style.lineHeight = unitless;
                break;
            }
            case 'letter-spacing': {
                const px = parsePx(value);
                if (px !== undefined) style.letterSpacing = px;
                break;
            }
            case 'border': {
                const parts = value.split(/\s+/);
                if (parts.length >= 1) {
                    const widthPx = parsePx(parts[0]);
                    if (widthPx !== undefined) style.borderWidth = widthPx;
                }
                if (parts.length >= 3) style.borderColor = parts[2];
                break;
            }
            case 'border-width': {
                const px = parsePx(value);
                if (px !== undefined) style.borderWidth = px;
                break;
            }
            case 'border-color': {
                style.borderColor = value;
                break;
            }
            case 'border-top-width': {
                const px = parsePx(value);
                if (px !== undefined && px > 0 && style.borderWidth === undefined) {
                    style.borderWidth = px;
                }
                break;
            }
            case 'border-top-color': {
                const hasBorder = style.borderWidth !== undefined && style.borderWidth > 0;
                if (hasBorder && (!style.borderColor || style.borderColor.startsWith('var('))) {
                    style.borderColor = value;
                }
                break;
            }
            case 'border-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.borderRadius = px;
                break;
            }
            case 'border-top-left-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.topLeftRadius = px;
                break;
            }
            case 'border-top-right-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.topRightRadius = px;
                break;
            }
            case 'border-bottom-left-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.bottomLeftRadius = px;
                break;
            }
            case 'border-bottom-right-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.bottomRightRadius = px;
                break;
            }
            case 'opacity': {
                const num = parseFloat(value);
                if (!isNaN(num)) style.opacity = num;
                break;
            }
            case 'position':
            case 'top':
            case 'left':
                break;
            case 'justify-content': {
                const display = parsed['display'];
                const isLayout =
                    display === 'flex' ||
                    display === 'inline-flex' ||
                    display === 'grid' ||
                    display === 'inline-grid';
                if (!isLayout) break;
                const map: Record<string, ImportIRStyle['justifyContent']> = {
                    'flex-start': 'MIN',
                    start: 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    end: 'MAX',
                    'space-between': 'SPACE_BETWEEN',
                };
                if (map[value]) style.justifyContent = map[value];
                break;
            }
            case 'align-items': {
                const display = parsed['display'];
                const isLayout =
                    display === 'flex' ||
                    display === 'inline-flex' ||
                    display === 'grid' ||
                    display === 'inline-grid';
                if (!isLayout) break;
                const map: Record<string, ImportIRStyle['alignItems']> = {
                    'flex-start': 'MIN',
                    start: 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    end: 'MAX',
                    stretch: 'STRETCH',
                };
                if (map[value]) style.alignItems = map[value];
                break;
            }
            case 'box-shadow': {
                const effect = parseBoxShadow(value);
                if (effect) {
                    style.effects = style.effects || [];
                    style.effects.push(effect);
                }
                break;
            }
            case 'text-decoration':
            case 'text-decoration-line': {
                if (value.includes('underline')) style.textDecoration = 'UNDERLINE';
                else if (value.includes('line-through')) style.textDecoration = 'STRIKETHROUGH';
                else if (value === 'none') style.textDecoration = 'NONE';
                break;
            }
            case 'text-transform': {
                const caseMap: Record<string, ImportIRStyle['textCase']> = {
                    uppercase: 'UPPER',
                    lowercase: 'LOWER',
                    capitalize: 'TITLE',
                    none: 'ORIGINAL',
                };
                if (caseMap[value]) style.textCase = caseMap[value];
                break;
            }
            case 'text-overflow': {
                if (value === 'ellipsis') style.textTruncation = 'ENDING';
                break;
            }
            case 'text-align': {
                const alignMap: Record<string, ImportIRStyle['textAlignHorizontal']> = {
                    left: 'LEFT',
                    start: 'LEFT',
                    center: 'CENTER',
                    right: 'RIGHT',
                    end: 'RIGHT',
                    justify: 'JUSTIFIED',
                };
                if (alignMap[value]) style.textAlignHorizontal = alignMap[value];
                break;
            }
            case 'overflow': {
                if (
                    value === 'hidden' ||
                    value === 'clip' ||
                    value === 'scroll' ||
                    value === 'auto'
                ) {
                    style.clipsContent = true;
                }
                break;
            }
            case 'flex-grow': {
                const num = parseFloat(value);
                if (!isNaN(num) && num > 0) style.flexGrow = num;
                break;
            }
            case 'grid-template-columns': {
                const colWidths = parseGridColumnWidths(value);
                if (colWidths) style.gridColumnWidths = colWidths;
                break;
            }
            case 'grid-template-rows': {
                const rowHeights = parseGridColumnWidths(value);
                if (rowHeights) style.gridRowHeights = rowHeights;
                break;
            }
            default:
                if (RECOGNIZED_BUT_NOT_STORED.has(prop)) break;
                warnings.push(`CSS_UNSUPPORTED_PROPERTY: ${prop}`);
        }
    }

    if (parsed['position'] === 'absolute') {
        style.isAbsolute = true;
        const topPx = parsePx(parsed['top'] ?? '');
        const leftPx = parsePx(parsed['left'] ?? '');
        if (topPx !== undefined) style.y = topPx;
        if (leftPx !== undefined) style.x = leftPx;
    }

    if (enrichedStyles?.boundingRect) {
        const rect = enrichedStyles.boundingRect;
        if (rect.width > 0) style.width = rect.width;
        if (rect.height > 0) style.height = rect.height;
        if (style.isAbsolute) {
            style.x = rect.x;
            style.y = rect.y;
        }
    }

    return { style, warnings };
}
