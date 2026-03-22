import type {
    ImportIRLayoutMode,
    ImportIRStyle,
    ImportIREffect,
    ImportIRFill,
    GridColumnDef,
} from './import-ir';
import type { ComputedStyleData } from './computed-style-types';

const DYNAMIC_PATTERN = /\{[^}]*\}/;

const GRADIENT_PLACEHOLDER_COLOR = '#E8E4DD';

function expandRepeat(value: string): string {
    return value.replace(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/g, (_, count, track) => {
        const n = parseInt(count, 10);
        return Array(n).fill(track.trim()).join(' ');
    });
}

export function parseGridColumns(value: string): GridColumnDef[] | undefined {
    const expanded = expandRepeat(value);
    const cols: GridColumnDef[] = [];

    for (const token of expanded.split(/\s+/).filter(Boolean)) {
        const pxMatch = token.match(/^([\d.]+)px$/);
        if (pxMatch) {
            cols.push({ type: 'FIXED', value: parseFloat(pxMatch[1]) });
            continue;
        }
        const frMatch = token.match(/^([\d.]+)fr$/);
        if (frMatch) {
            cols.push({ type: 'FLEX', value: parseFloat(frMatch[1]) });
            continue;
        }
        const pctMatch = token.match(/^([\d.]+)%$/);
        if (pctMatch) {
            cols.push({ type: 'FLEX', value: parseFloat(pctMatch[1]) / 100 });
            continue;
        }
        if (token === 'auto') {
            cols.push({ type: 'FLEX', value: 1 });
            continue;
        }
        const minmaxMatch = token.match(/^minmax\(([^,]+),\s*([^)]+)\)$/);
        if (minmaxMatch) {
            const maxPart = minmaxMatch[2].trim();
            const frInner = maxPart.match(/^([\d.]+)fr$/);
            if (frInner) {
                cols.push({ type: 'FLEX', value: parseFloat(frInner[1]) });
            } else {
                const pxInner = maxPart.match(/^([\d.]+)px$/);
                cols.push({ type: 'FIXED', value: pxInner ? parseFloat(pxInner[1]) : 300 });
            }
            continue;
        }
    }
    return cols.length > 0 ? cols : undefined;
}

function parseGridColumnWidths(value: string): number[] | undefined {
    const cols = parseGridColumns(value);
    if (!cols) return undefined;
    return cols.map((c) => c.value);
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

/** True for CSS lengths that resolve to zero inset (DL-108 overlay detection). */
function cssInsetIsZero(value: string | undefined): boolean {
    if (value === undefined) return false;
    const v = value.trim().toLowerCase();
    return v === '0' || v === '0px' || v === '0em' || v === '0rem';
}

function expandInsetShorthand(raw: string): {
    top: string;
    right: string;
    bottom: string;
    left: string;
} {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { top: '0', right: '0', bottom: '0', left: '0' };
    if (parts.length === 1) {
        const p = parts[0]!;
        return { top: p, right: p, bottom: p, left: p };
    }
    if (parts.length === 2) {
        const [v, h] = parts as [string, string];
        return { top: v, right: h, bottom: v, left: h };
    }
    if (parts.length === 3) {
        const [t, h, b] = parts as [string, string, string];
        return { top: t, right: h, bottom: b, left: h };
    }
    const [t, r, b, l] = parts as [string, string, string, string];
    return { top: t, right: r, bottom: b, left: l };
}

function parsedIndicatesFullInset(parsed: Record<string, string>): boolean {
    const insetRaw = parsed['inset'];
    if (
        insetRaw !== undefined &&
        insetRaw.trim() !== '' &&
        insetRaw.trim().toLowerCase() !== 'auto'
    ) {
        const { top, right, bottom, left } = expandInsetShorthand(insetRaw);
        if (
            cssInsetIsZero(top) &&
            cssInsetIsZero(right) &&
            cssInsetIsZero(bottom) &&
            cssInsetIsZero(left)
        ) {
            return true;
        }
    }
    return (
        cssInsetIsZero(parsed['top']) &&
        cssInsetIsZero(parsed['right']) &&
        cssInsetIsZero(parsed['bottom']) &&
        cssInsetIsZero(parsed['left'])
    );
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
    'transform',
    'transform-origin',
    'grid-auto-flow',
    'flex-shrink',
    'flex-basis',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
]);

function parseBoxShadow(value: string): ImportIREffect[] {
    const effects: ImportIREffect[] = [];
    // Split multiple shadows on commas not inside parentheses
    const shadows = splitOutsideParens(value, ',');
    for (const shadow of shadows) {
        const trimmed = shadow.trim();
        if (trimmed === 'none') continue;
        const isInset = trimmed.startsWith('inset ');
        const shadowStr = isInset ? trimmed.slice(6).trim() : trimmed;
        const match = shadowStr.match(
            /^([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s*(?:([\d.]+)px\s+)?(.+)$/,
        );
        if (!match) continue;
        const [, xStr, yStr, blurStr, spreadStr, colorStr] = match;
        effects.push({
            type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
            offset: { x: parseFloat(xStr), y: parseFloat(yStr) },
            radius: parseFloat(blurStr),
            spread: spreadStr ? parseFloat(spreadStr) : undefined,
            color: colorStr.trim(),
        });
    }
    return effects;
}

function splitOutsideParens(str: string, delimiter: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === delimiter && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current) parts.push(current);
    return parts;
}

function parseLinearGradient(value: string): ImportIRFill | undefined {
    const match = value.match(/^linear-gradient\((.+)\)$/);
    if (!match) return undefined;

    const inner = match[1];
    const parts = splitOutsideParens(inner, ',');
    if (parts.length < 2) return undefined;

    let angle = 180; // default: to bottom
    let stopStart = 0;
    const firstPart = parts[0].trim();

    // Parse angle
    const degMatch = firstPart.match(/^([\d.]+)deg$/);
    if (degMatch) {
        angle = parseFloat(degMatch[1]);
        stopStart = 1;
    } else if (firstPart === 'to bottom') {
        angle = 180;
        stopStart = 1;
    } else if (firstPart === 'to top') {
        angle = 0;
        stopStart = 1;
    } else if (firstPart === 'to right') {
        angle = 90;
        stopStart = 1;
    } else if (firstPart === 'to left') {
        angle = 270;
        stopStart = 1;
    } else if (firstPart === 'to bottom right') {
        angle = 135;
        stopStart = 1;
    } else if (firstPart === 'to bottom left') {
        angle = 225;
        stopStart = 1;
    } else if (firstPart === 'to top right') {
        angle = 45;
        stopStart = 1;
    } else if (firstPart === 'to top left') {
        angle = 315;
        stopStart = 1;
    }

    const stops: Array<{ position: number; color: string }> = [];
    for (let i = stopStart; i < parts.length; i++) {
        const stopStr = parts[i].trim();
        const posMatch = stopStr.match(/^(.+?)\s+([\d.]+)%$/);
        if (posMatch) {
            stops.push({ color: posMatch[1].trim(), position: parseFloat(posMatch[2]) / 100 });
        } else {
            // Evenly distribute stops without explicit positions
            const pos =
                parts.length - stopStart <= 1
                    ? 0
                    : (i - stopStart) / (parts.length - stopStart - 1);
            stops.push({ color: stopStr, position: pos });
        }
    }

    if (stops.length < 2) return undefined;
    return { type: 'GRADIENT_LINEAR', angle, stops };
}

function parseBlurRadius(value: string): number | undefined {
    const match = value.match(/blur\(([\d.]+)px\)/);
    return match ? parseFloat(match[1]) : undefined;
}

const CSS_NAMED_COLORS = new Set([
    'transparent',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
    'gray',
    'grey',
    'brown',
    'cyan',
    'magenta',
    'lime',
    'navy',
    'teal',
    'aqua',
    'maroon',
    'olive',
    'silver',
    'fuchsia',
    'aliceblue',
    'antiquewhite',
    'aquamarine',
    'azure',
    'beige',
    'bisque',
    'blanchedalmond',
    'blueviolet',
    'burlywood',
    'cadetblue',
    'chartreuse',
    'chocolate',
    'coral',
    'cornflowerblue',
    'cornsilk',
    'crimson',
    'darkblue',
    'darkcyan',
    'darkgoldenrod',
    'darkgray',
    'darkgreen',
    'darkgrey',
    'darkkhaki',
    'darkmagenta',
    'darkolivegreen',
    'darkorange',
    'darkorchid',
    'darkred',
    'darksalmon',
    'darkseagreen',
    'darkslateblue',
    'darkslategray',
    'darkslategrey',
    'darkturquoise',
    'darkviolet',
    'deeppink',
    'deepskyblue',
    'dimgray',
    'dimgrey',
    'dodgerblue',
    'firebrick',
    'floralwhite',
    'forestgreen',
    'gainsboro',
    'ghostwhite',
    'gold',
    'goldenrod',
    'greenyellow',
    'honeydew',
    'hotpink',
    'indianred',
    'indigo',
    'ivory',
    'khaki',
    'lavender',
    'lavenderblush',
    'lawngreen',
    'lemonchiffon',
    'lightblue',
    'lightcoral',
    'lightcyan',
    'lightgoldenrodyellow',
    'lightgray',
    'lightgreen',
    'lightgrey',
    'lightpink',
    'lightsalmon',
    'lightseagreen',
    'lightskyblue',
    'lightslategray',
    'lightslategrey',
    'lightsteelblue',
    'lightyellow',
    'limegreen',
    'linen',
    'mediumaquamarine',
    'mediumblue',
    'mediumorchid',
    'mediumpurple',
    'mediumseagreen',
    'mediumslateblue',
    'mediumspringgreen',
    'mediumturquoise',
    'mediumvioletred',
    'midnightblue',
    'mintcream',
    'mistyrose',
    'moccasin',
    'navajowhite',
    'oldlace',
    'olivedrab',
    'orangered',
    'orchid',
    'palegoldenrod',
    'palegreen',
    'paleturquoise',
    'palevioletred',
    'papayawhip',
    'peachpuff',
    'peru',
    'plum',
    'powderblue',
    'rosybrown',
    'royalblue',
    'saddlebrown',
    'salmon',
    'sandybrown',
    'seagreen',
    'seashell',
    'sienna',
    'skyblue',
    'slateblue',
    'slategray',
    'slategrey',
    'snow',
    'springgreen',
    'steelblue',
    'tan',
    'thistle',
    'tomato',
    'turquoise',
    'violet',
    'wheat',
    'whitesmoke',
    'yellowgreen',
]);

function extractColorFromBackground(value: string): string | undefined {
    const v = value.trim();
    if (v.startsWith('#')) return v.split(/\s/)[0];
    if (
        v.startsWith('rgb(') ||
        v.startsWith('rgba(') ||
        v.startsWith('hsl(') ||
        v.startsWith('hsla(')
    ) {
        const end = v.indexOf(')');
        if (end !== -1) return v.slice(0, end + 1);
    }
    const lower = v.split(/\s/)[0].toLowerCase();
    if (CSS_NAMED_COLORS.has(lower)) return lower;
    return undefined;
}

export type CssClassMap = Map<string, Record<string, string>>;

/**
 * Remove all @-rule blocks (@media, @supports, @keyframes, etc.) from CSS
 * text so the simple regex parser only sees top-level rules. This prevents
 * responsive breakpoint rules from overriding base styles.
 */
function stripAtRuleBlocks(css: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < css.length) {
        if (css[i] === '@') {
            // Found an @-rule — skip to its opening brace, then balance braces
            const braceStart = css.indexOf('{', i);
            if (braceStart === -1) break;
            let depth = 1;
            let j = braceStart + 1;
            while (j < css.length && depth > 0) {
                if (css[j] === '{') depth++;
                else if (css[j] === '}') depth--;
                j++;
            }
            i = j;
        } else {
            result.push(css[i]);
            i++;
        }
    }
    return result.join('');
}

export function parseCssToClassMap(cssText: string): { classMap: CssClassMap; warnings: string[] } {
    const classMap: CssClassMap = new Map();
    const warnings: string[] = [];
    if (!cssText) return { classMap, warnings };

    // Remove comments
    let cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

    // Strip @-rule blocks (e.g. @media, @supports, @keyframes) which contain
    // nested rule blocks that our simple regex-based parser would misinterpret
    // as top-level rules — responsive breakpoints would override base styles.
    cleaned = stripAtRuleBlocks(cleaned);

    // First pass: collect CSS custom properties from :root / html / body
    const customProperties = new Map<string, string>();
    const rootRuleRegex = /(?::root|html|body)\s*\{([^{}]*)\}/g;
    let rootMatch: RegExpExecArray | null;
    while ((rootMatch = rootRuleRegex.exec(cleaned)) !== null) {
        for (const decl of rootMatch[1].split(';')) {
            const trimmed = decl.trim();
            if (!trimmed) continue;
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx === -1) continue;
            const prop = trimmed.slice(0, colonIdx).trim();
            const val = trimmed.slice(colonIdx + 1).trim();
            if (prop.startsWith('--') && val) {
                customProperties.set(prop, val);
            }
        }
    }

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
                let val = trimmed.slice(colonIdx + 1).trim();
                if (!prop || !val) continue;

                // Resolve CSS custom properties: var(--name) → resolved value
                if (val.includes('var(') && customProperties.size > 0) {
                    val = val.replace(
                        /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g,
                        (_, varName, fallback) =>
                            customProperties.get(varName) ?? fallback?.trim() ?? val,
                    );
                }

                props[prop] = val;
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
): { style: ImportIRStyle; warnings: string[]; unsupportedCss: Record<string, string> } {
    const warnings: string[] = [];
    const style: ImportIRStyle = {};
    const unsupportedCss: Record<string, string> = {};

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

    // When both `background` (shorthand) and `background-image` (longhand) exist,
    // drop the shorthand to prevent both from independently pushing gradient fills.
    // The longhand is more specific (comes from enricher or explicit inline) and wins.
    if (parsed['background-image'] && parsed['background']) {
        delete parsed['background'];
    }

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
                style.display = value;
                if (value === 'flex' || value === 'inline-flex') {
                    if (!style.layoutMode) style.layoutMode = 'row';
                } else if (value === 'grid' || value === 'inline-grid') {
                    style.layoutMode = 'grid';
                    const gridCols = parsed['grid-template-columns'];
                    if (gridCols) {
                        style.gridColumnWidths = parseGridColumnWidths(gridCols);
                        style.gridColumns = parseGridColumns(gridCols);
                    }
                    const gridRows = parsed['grid-template-rows'];
                    if (gridRows) {
                        style.gridRowHeights = parseGridColumnWidths(gridRows);
                        style.gridRows = parseGridColumns(gridRows);
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
                // Single-color gradient (e.g., CSS resolves solid bg to gradient form)
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
                    break;
                }
                // Real gradient
                const gradient = parseLinearGradient(value);
                if (gradient) {
                    style.fills = style.fills || [];
                    style.fills.push(gradient);
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
                break;
            case 'background': {
                // Extract color/gradient from the shorthand.
                // Delegate to the same logic as background-color / background-image.
                if (value.includes('gradient')) {
                    const gradient = parseLinearGradient(value);
                    if (gradient) {
                        style.fills = style.fills || [];
                        style.fills.push(gradient);
                    } else if (
                        !style.backgroundColor ||
                        style.backgroundColor === 'rgba(0, 0, 0, 0)'
                    ) {
                        style.backgroundColor = GRADIENT_PLACEHOLDER_COLOR;
                    }
                } else if (value.includes('url(')) {
                    // url() in background shorthand — skip for now
                } else {
                    // Likely a plain color value (possibly with extra tokens like `none`).
                    // Extract the first color-like token.
                    const colorToken = extractColorFromBackground(value);
                    if (colorToken) {
                        style.backgroundColor = colorToken;
                    }
                }
                break;
            }
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
                if (px !== undefined) {
                    style.borderTopWidth = px;
                    if (px > 0 && style.borderWidth === undefined) style.borderWidth = px;
                }
                break;
            }
            case 'border-right-width': {
                const px = parsePx(value);
                if (px !== undefined) style.borderRightWidth = px;
                break;
            }
            case 'border-bottom-width': {
                const px = parsePx(value);
                if (px !== undefined) style.borderBottomWidth = px;
                break;
            }
            case 'border-left-width': {
                const px = parsePx(value);
                if (px !== undefined) style.borderLeftWidth = px;
                break;
            }
            case 'border-top-color': {
                if (!style.borderColor || style.borderColor.startsWith('var(')) {
                    style.borderColor = value;
                }
                break;
            }
            case 'border-right-color':
            case 'border-bottom-color':
            case 'border-left-color': {
                if (!style.borderColor || style.borderColor === 'transparent') {
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
            case 'right':
            case 'bottom':
            case 'inset':
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
                const effects = parseBoxShadow(value);
                if (effects.length > 0) {
                    style.effects = style.effects || [];
                    style.effects.push(...effects);
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
            case 'font-style': {
                if (value === 'italic' || value === 'oblique') style.fontStyle = 'italic';
                else style.fontStyle = 'normal';
                break;
            }
            case 'filter': {
                if (value === 'none') break;
                const blur = parseBlurRadius(value);
                if (blur !== undefined && blur > 0) {
                    style.effects = style.effects || [];
                    style.effects.push({ type: 'LAYER_BLUR', radius: blur });
                }
                break;
            }
            case 'backdrop-filter': {
                if (value === 'none') break;
                const blur = parseBlurRadius(value);
                if (blur !== undefined && blur > 0) {
                    style.effects = style.effects || [];
                    style.effects.push({ type: 'BACKGROUND_BLUR', radius: blur });
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
                const gridCols = parseGridColumns(value);
                if (gridCols) style.gridColumns = gridCols;
                break;
            }
            case 'grid-template-rows': {
                const rowHeights = parseGridColumnWidths(value);
                if (rowHeights) style.gridRowHeights = rowHeights;
                const gridRows = parseGridColumns(value);
                if (gridRows) style.gridRows = gridRows;
                break;
            }
            case 'grid-column': {
                const spanMatch = value.match(/span\s+(\d+)/);
                if (spanMatch) style.gridColumnSpan = parseInt(spanMatch[1], 10);
                break;
            }
            case 'grid-row': {
                const spanMatch = value.match(/span\s+(\d+)/);
                if (spanMatch) style.gridRowSpan = parseInt(spanMatch[1], 10);
                break;
            }
            default:
                if (RECOGNIZED_BUT_NOT_STORED.has(prop)) break;
                unsupportedCss[prop] = value;
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

    if (parsed['position'] === 'fixed') {
        style.isFixed = true;
        style.isAbsolute = true;
    }

    const pos = parsed['position'];
    if ((pos === 'fixed' || pos === 'absolute') && parsedIndicatesFullInset(parsed)) {
        style.isFullOverlay = true;
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

    return { style, warnings, unsupportedCss };
}
