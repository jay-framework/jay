import type { ImportIRLayoutMode, ImportIRStyle } from './import-ir';

const DYNAMIC_PATTERN = /\{[^}]*\}/;

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

const RECOGNIZED_BUT_NOT_STORED = new Set(['box-sizing', 'overflow', 'object-fit', 'text-align']);

export function resolveStyle(
    inlineStyle: string,
    _classNames?: string[],
    _cssRules?: string,
): { style: ImportIRStyle; warnings: string[] } {
    const warnings: string[] = [];
    const style: ImportIRStyle = {};
    const { parsed, dynamicProperties } = parseInlineStyle(inlineStyle);

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
                if (value === 'flex') {
                    if (!style.layoutMode) style.layoutMode = 'row';
                }
                break;
            case 'flex-direction':
                if (value === 'column') style.layoutMode = 'column';
                else if (value === 'row') style.layoutMode = 'row';
                break;
            case 'gap': {
                const px = parsePx(value);
                if (px !== undefined) style.gap = px;
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
            case 'border-radius': {
                const px = parsePx(value);
                if (px !== undefined) style.borderRadius = px;
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
                const map: Record<string, ImportIRStyle['justifyContent']> = {
                    'flex-start': 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    'space-between': 'SPACE_BETWEEN',
                };
                if (map[value]) style.justifyContent = map[value];
                break;
            }
            case 'align-items': {
                const map: Record<string, ImportIRStyle['alignItems']> = {
                    'flex-start': 'MIN',
                    center: 'CENTER',
                    'flex-end': 'MAX',
                    stretch: 'STRETCH',
                };
                if (map[value]) style.alignItems = map[value];
                break;
            }
            default:
                if (RECOGNIZED_BUT_NOT_STORED.has(prop)) break;
                warnings.push(`CSS_UNSUPPORTED_PROPERTY: ${prop}`);
        }
    }

    if (parsed['position'] === 'absolute') {
        const topPx = parsePx(parsed['top'] ?? '');
        const leftPx = parsePx(parsed['left'] ?? '');
        if (topPx !== undefined) style.y = topPx;
        if (leftPx !== undefined) style.x = leftPx;
    }

    return { style, warnings };
}
