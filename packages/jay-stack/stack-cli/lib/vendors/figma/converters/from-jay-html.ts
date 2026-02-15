/**
 * Jay-HTML to FigmaVendorDocument Converter
 *
 * Converts a compiler-parsed JayHtmlSourceFile into a FigmaVendorDocument tree
 * that can be imported into the Figma plugin.
 *
 * Uses the compiler's parseJayFile output which provides:
 * - Parsed body DOM tree (HTMLElement from node-html-parser)
 * - Resolved headless imports with plugin/contract info
 * - Contract data
 * - Extracted CSS
 *
 * This is a lossy conversion - Figma-specific data (gradients, complex effects, etc.)
 * cannot be fully reconstructed from HTML.
 *
 * See Design Log #90 for the full design.
 */

import { HTMLElement, NodeType } from 'node-html-parser';
import type { JayHtmlSourceFile, JayHeadlessImports } from '@jay-framework/compiler-jay-html';
import { ContractTagType, parseEnumValues } from '@jay-framework/compiler-jay-html';
import type { Contract, ContractTag } from '@jay-framework/compiler-jay-html';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

// ─── Module-level context (set per conversion) ──────────────────────────────

/** Headless imports with resolved contracts — set in convertJayHtmlToFigmaDoc */
let currentHeadlessImports: JayHeadlessImports[] = [];

// ─── Style Parsing ───────────────────────────────────────────────────────────

/**
 * Parses an inline CSS style string into a key-value map
 */
function parseStyleString(styleStr: string): Map<string, string> {
    const styles = new Map<string, string>();
    if (!styleStr) return styles;

    for (const declaration of styleStr.split(';')) {
        const trimmed = declaration.trim();
        if (!trimmed) continue;
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;
        const property = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        if (property && value) {
            styles.set(property, value);
        }
    }
    return styles;
}

/**
 * Parses a CSS px value (e.g., "100px") to a number. Returns undefined for non-px values.
 */
function parsePx(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = value.match(/^(-?[\d.]+)px$/);
    return match ? parseFloat(match[1]) : undefined;
}

/**
 * Parses a CSS percentage value (e.g., "50%") to a number. Returns undefined for non-% values.
 */
function parsePercent(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = value.match(/^(-?[\d.]+)%$/);
    return match ? parseFloat(match[1]) : undefined;
}

/**
 * Parses a CSS color string into a Figma-compatible paint fill.
 * Supports: rgb(), rgba(), hex (#rgb, #rrggbb, #rrggbbaa).
 */
function parseColorToFill(
    colorStr: string,
): { type: 'SOLID'; color: { r: number; g: number; b: number }; opacity?: number } | undefined {
    if (!colorStr) return undefined;

    // rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = colorStr.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
    );
    if (rgbMatch) {
        return {
            type: 'SOLID',
            color: {
                r: parseInt(rgbMatch[1]) / 255,
                g: parseInt(rgbMatch[2]) / 255,
                b: parseInt(rgbMatch[3]) / 255,
            },
            opacity: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : undefined,
        };
    }

    // Hex: #rrggbb or #rrggbbaa or #rgb
    const hexMatch = colorStr.match(/^#([0-9a-fA-F]+)$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : undefined;
            return { type: 'SOLID', color: { r, g, b }, opacity: a };
        }
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16) / 255;
            const g = parseInt(hex[1] + hex[1], 16) / 255;
            const b = parseInt(hex[2] + hex[2], 16) / 255;
            return { type: 'SOLID', color: { r, g, b } };
        }
    }

    return undefined;
}

/**
 * Parses background fills from CSS background-image property.
 * Handles the pattern our forward export produces:
 *   background-image: linear-gradient(rgba(R, G, B, A), rgba(R, G, B, A));
 * where both stops are the same color (representing a solid fill).
 * Supports multiple comma-separated gradients (layered fills).
 *
 * Note: Can't use simple regex like /linear-gradient\(([^)]+)\)/ because the content
 * contains nested parentheses from rgba(...). Uses balanced-paren extraction instead.
 */
function parseBackgroundImageToFills(
    bgImage: string,
): Array<{ type: 'SOLID'; color: { r: number; g: number; b: number }; opacity?: number }> {
    if (!bgImage) return [];

    const fills: Array<{
        type: 'SOLID';
        color: { r: number; g: number; b: number };
        opacity?: number;
    }> = [];

    // Find each linear-gradient(...) by matching balanced parentheses
    const prefix = 'linear-gradient(';
    let searchFrom = 0;
    while (true) {
        const start = bgImage.indexOf(prefix, searchFrom);
        if (start === -1) break;

        // Find the matching closing paren, accounting for nested parens from rgba()
        const contentStart = start + prefix.length;
        let depth = 1;
        let i = contentStart;
        while (i < bgImage.length && depth > 0) {
            if (bgImage[i] === '(') depth++;
            else if (bgImage[i] === ')') depth--;
            i++;
        }

        if (depth === 0) {
            const gradientContent = bgImage.substring(contentStart, i - 1);
            // Extract the first rgba/rgb color from the gradient (our export uses identical stops)
            const colorFill = parseColorToFill(gradientContent);
            if (colorFill) {
                fills.push(colorFill);
            }
        }

        searchFrom = i;
    }

    return fills;
}

/**
 * Parses a CSS box-shadow value into Figma effects.
 * Supports the pattern our forward export produces:
 *   box-shadow: Xpx Ypx Rpx Spx rgba(R, G, B, A), ...;
 * where inset keyword maps to INNER_SHADOW, otherwise DROP_SHADOW.
 */
function parseBoxShadowToEffects(boxShadow: string): Array<{
    type: 'DROP_SHADOW' | 'INNER_SHADOW';
    color: { r: number; g: number; b: number; a: number };
    offset: { x: number; y: number };
    radius: number;
    spread?: number;
    visible: boolean;
}> {
    if (!boxShadow || boxShadow === 'none') return [];

    const effects: Array<{
        type: 'DROP_SHADOW' | 'INNER_SHADOW';
        color: { r: number; g: number; b: number; a: number };
        offset: { x: number; y: number };
        radius: number;
        spread?: number;
        visible: boolean;
    }> = [];

    // Split on commas that are NOT inside parentheses (to avoid splitting rgba(r,g,b,a))
    const shadows = splitOutsideParens(boxShadow);

    for (const shadow of shadows) {
        const trimmed = shadow.trim();
        if (!trimmed) continue;

        const isInset = trimmed.startsWith('inset');
        const valuePart = isInset ? trimmed.replace(/^inset\s*/, '') : trimmed;

        // Extract px values and color
        const pxValues: number[] = [];
        const pxPattern = /(-?[\d.]+)px/g;
        let pxMatch: RegExpExecArray | null;
        while ((pxMatch = pxPattern.exec(valuePart)) !== null) {
            pxValues.push(parseFloat(pxMatch[1]));
        }

        const colorMatch = valuePart.match(
            /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
        );
        if (pxValues.length >= 3 && colorMatch) {
            const [offsetX, offsetY, blur, spread] = pxValues;
            effects.push({
                type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
                color: {
                    r: parseInt(colorMatch[1]) / 255,
                    g: parseInt(colorMatch[2]) / 255,
                    b: parseInt(colorMatch[3]) / 255,
                    a: colorMatch[4] !== undefined ? parseFloat(colorMatch[4]) : 1,
                },
                offset: { x: offsetX, y: offsetY },
                radius: blur,
                spread: spread !== undefined ? spread : undefined,
                visible: true,
            });
        }
    }

    return effects;
}

/**
 * Parses CSS filter/backdrop-filter for blur values.
 * Pattern: filter: blur(Npx);
 */
function parseBlurFromFilter(filterStr: string): number | undefined {
    if (!filterStr) return undefined;
    const match = filterStr.match(/blur\(\s*([\d.]+)px\s*\)/);
    return match ? parseFloat(match[1]) : undefined;
}

/**
 * Splits a CSS value string on commas that are not inside parentheses.
 * E.g., "0px 1px 2px rgba(0,0,0,0.5), inset 1px 1px 0px rgba(0,0,0,1)"
 * → ["0px 1px 2px rgba(0,0,0,0.5)", " inset 1px 1px 0px rgba(0,0,0,1)"]
 */
function splitOutsideParens(str: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') depth--;
        else if (str[i] === ',' && depth === 0) {
            results.push(str.substring(start, i));
            start = i + 1;
        }
    }
    results.push(str.substring(start));
    return results;
}

/**
 * Parses CSS transform for rotation.
 * Pattern: transform: rotate(Ndeg);
 */
function parseRotationFromTransform(transformStr: string): number | undefined {
    if (!transformStr) return undefined;
    const match = transformStr.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/);
    return match ? parseFloat(match[1]) : undefined;
}

// ─── Style to Figma Property Mapping ─────────────────────────────────────────

interface FigmaLayoutProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
    itemSpacing?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    cornerRadius?: number;
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomLeftRadius?: number;
    bottomRightRadius?: number;
    fills?: any[];
    strokes?: any[];
    strokeWeight?: number;
    strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
    strokeTopWeight?: number;
    strokeRightWeight?: number;
    strokeBottomWeight?: number;
    strokeLeftWeight?: number;
    opacity?: number;
    clipsContent?: boolean;
    overflowDirection?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
    layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
    rotation?: number;
    effects?: any[];
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    layoutWrap?: 'NO_WRAP' | 'WRAP';
    layoutPositioning?: 'AUTO' | 'ABSOLUTE';
}

/**
 * Converts CSS styles to Figma layout and visual properties
 */
function stylesToFigmaProps(styles: Map<string, string>): FigmaLayoutProps {
    const props: FigmaLayoutProps = {};

    // Position
    props.x = parsePx(styles.get('left'));
    props.y = parsePx(styles.get('top'));

    // layoutPositioning — "ABSOLUTE" when CSS has position: absolute (Design Log #91.1)
    const position = styles.get('position');
    if (position === 'absolute') {
        props.layoutPositioning = 'ABSOLUTE';
    }

    // Size
    props.width = parsePx(styles.get('width'));
    props.height = parsePx(styles.get('height'));

    // Flex layout
    const display = styles.get('display');
    const flexDirection = styles.get('flex-direction');
    if (display === 'flex') {
        props.layoutMode = flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL';

        // Justify content → primaryAxisAlignItems
        const justifyContent = styles.get('justify-content');
        if (justifyContent === 'center') props.primaryAxisAlignItems = 'CENTER';
        else if (justifyContent === 'flex-end') props.primaryAxisAlignItems = 'MAX';
        else if (justifyContent === 'space-between') props.primaryAxisAlignItems = 'SPACE_BETWEEN';
        else props.primaryAxisAlignItems = 'MIN';

        // Align items → counterAxisAlignItems
        const alignItems = styles.get('align-items');
        if (alignItems === 'center') props.counterAxisAlignItems = 'CENTER';
        else if (alignItems === 'flex-end') props.counterAxisAlignItems = 'MAX';
        else props.counterAxisAlignItems = 'MIN';

        // Gap → itemSpacing
        props.itemSpacing = parsePx(styles.get('gap'));
    }

    // Padding
    const padding = parsePx(styles.get('padding'));
    if (padding !== undefined) {
        props.paddingLeft = padding;
        props.paddingRight = padding;
        props.paddingTop = padding;
        props.paddingBottom = padding;
    }
    const paddingLeft = parsePx(styles.get('padding-left'));
    if (paddingLeft !== undefined) props.paddingLeft = paddingLeft;
    const paddingRight = parsePx(styles.get('padding-right'));
    if (paddingRight !== undefined) props.paddingRight = paddingRight;
    const paddingTop = parsePx(styles.get('padding-top'));
    if (paddingTop !== undefined) props.paddingTop = paddingTop;
    const paddingBottom = parsePx(styles.get('padding-bottom'));
    if (paddingBottom !== undefined) props.paddingBottom = paddingBottom;

    // Border radius
    const borderRadius = parsePx(styles.get('border-radius'));
    if (borderRadius !== undefined) {
        props.cornerRadius = borderRadius;
    }
    const topLeft = parsePx(styles.get('border-top-left-radius'));
    const topRight = parsePx(styles.get('border-top-right-radius'));
    const bottomLeft = parsePx(styles.get('border-bottom-left-radius'));
    const bottomRight = parsePx(styles.get('border-bottom-right-radius'));
    if (topLeft !== undefined) props.topLeftRadius = topLeft;
    if (topRight !== undefined) props.topRightRadius = topRight;
    if (bottomLeft !== undefined) props.bottomLeftRadius = bottomLeft;
    if (bottomRight !== undefined) props.bottomRightRadius = bottomRight;

    // Background fills — multiple sources, in priority order:
    // 1. background-image: linear-gradient(rgba(...), rgba(...)) — our forward export pattern for solid fills
    // 2. background-color: rgb(...) or background: rgb(...) — standard CSS
    // 3. background: transparent/none — explicitly empty fills
    // IMPORTANT: fills: [] means "transparent" to the deserializer. Omitting fills entirely
    // causes figma.createFrame() to keep its default WHITE fill. Must emit [] for transparent.
    const bgImage = styles.get('background-image');
    const bgColor = styles.get('background-color') || styles.get('background');
    if (bgImage) {
        const fills = parseBackgroundImageToFills(bgImage);
        if (fills.length > 0) {
            props.fills = fills;
        }
    } else if (bgColor && bgColor !== 'transparent' && bgColor !== 'none') {
        const fill = parseColorToFill(bgColor);
        if (fill) {
            props.fills = [fill];
        }
    } else if (bgColor === 'transparent' || bgColor === 'none') {
        // Explicit transparent/none → empty fills array (overrides Figma's default white fill)
        props.fills = [];
    }

    // Border → strokes
    // Handle both shorthand and separate properties (our forward export uses separate props)
    const border = styles.get('border');
    if (border) {
        const borderParts = border.match(/^([\d.]+)px\s+\w+\s+(.*)/);
        if (borderParts) {
            const w = parseFloat(borderParts[1]);
            props.strokeWeight = w;
            props.strokeTopWeight = w;
            props.strokeRightWeight = w;
            props.strokeBottomWeight = w;
            props.strokeLeftWeight = w;
            const strokeFill = parseColorToFill(borderParts[2]);
            if (strokeFill) {
                props.strokes = [strokeFill];
            }
        }
    }
    // Separate border properties (forward export pattern: border-color + border-width + border-style)
    const borderColor = styles.get('border-color');
    if (borderColor && !props.strokes) {
        const strokeFill = parseColorToFill(borderColor);
        if (strokeFill) props.strokes = [strokeFill];
    }
    const borderWidth = styles.get('border-width');
    if (borderWidth !== undefined) {
        // Handle multi-value border-width: "top right bottom left"
        const parts = borderWidth.trim().split(/\s+/);
        if (parts.length === 1) {
            const w = parsePx(parts[0]);
            if (w !== undefined) {
                props.strokeWeight = w;
                props.strokeTopWeight = w;
                props.strokeRightWeight = w;
                props.strokeBottomWeight = w;
                props.strokeLeftWeight = w;
            }
        } else if (parts.length === 4) {
            // Per-side stroke weights: top right bottom left
            const [top, right, bottom, left] = parts.map((p) => parsePx(p) ?? 0);
            props.strokeTopWeight = top;
            props.strokeRightWeight = right;
            props.strokeBottomWeight = bottom;
            props.strokeLeftWeight = left;
            const maxWeight = Math.max(top, right, bottom, left);
            if (maxWeight > 0) props.strokeWeight = maxWeight;
        }
    }

    // strokeAlign: CSS borders are always inside the element box
    if (props.strokes && props.strokes.length > 0) {
        props.strokeAlign = 'INSIDE';
    }

    // Opacity
    const opacity = styles.get('opacity');
    if (opacity !== undefined) {
        props.opacity = parseFloat(opacity);
    }

    // Overflow → clipsContent / overflowDirection
    const overflow = styles.get('overflow');
    const overflowX = styles.get('overflow-x');
    const overflowY = styles.get('overflow-y');
    if (overflow === 'hidden') {
        props.clipsContent = true;
    } else if (overflow === 'auto' || overflow === 'scroll') {
        props.overflowDirection = 'BOTH';
    }
    if (overflowX === 'auto' || overflowX === 'scroll') {
        props.overflowDirection =
            props.overflowDirection === 'BOTH' || overflowY === 'auto' || overflowY === 'scroll'
                ? 'BOTH'
                : 'HORIZONTAL';
        props.clipsContent = true;
    }
    if (overflowY === 'auto' || overflowY === 'scroll') {
        props.overflowDirection =
            props.overflowDirection === 'BOTH' || overflowX === 'auto' || overflowX === 'scroll'
                ? 'BOTH'
                : 'VERTICAL';
        props.clipsContent = true;
    }

    // Width/height sizing — handle FILL, HUG, FIXED
    // Priority: FILL (100%, flex-grow) > HUG (fit-content) > FIXED (explicit px)
    const widthStr = styles.get('width');
    const heightStr = styles.get('height');
    if (widthStr === '100%') {
        props.layoutSizingHorizontal = 'FILL';
    } else if (widthStr === 'fit-content') {
        props.layoutSizingHorizontal = 'HUG';
    }
    if (heightStr === '100%') {
        props.layoutSizingVertical = 'FILL';
    } else if (heightStr === 'fit-content') {
        props.layoutSizingVertical = 'HUG';
    }

    // flex-grow → FILL sizing (forward export uses flex-grow: 1 for FILL in the primary axis)
    const flexGrow = styles.get('flex-grow');
    if (flexGrow && parseFloat(flexGrow) > 0) {
        // flex-grow in a horizontal parent means FILL horizontally, in vertical means FILL vertically
        // We can't know the parent axis here, so set both as candidates — the parent context
        // will be handled by the caller if needed. For now, flex-grow implies FILL.
        // The forward export sets flex-grow: 1 alongside width: 0 or height: 0 for the grow axis.
        const widthVal = styles.get('width');
        const heightVal = styles.get('height');
        if (widthVal === '0' || widthVal === '0px') {
            props.layoutSizingHorizontal = 'FILL';
        }
        if (heightVal === '0' || heightVal === '0px') {
            props.layoutSizingVertical = 'FILL';
        }
        // If neither dimension is 0, flex-grow still implies FILL in the primary axis
        if (!props.layoutSizingHorizontal && !props.layoutSizingVertical) {
            props.layoutSizingHorizontal = 'FILL';
        }
    }

    // FIXED sizing: when explicit pixel dimensions are set and sizing isn't already FILL or HUG.
    // In Figma, FIXED means "use the explicit width/height value" — this is the default for
    // elements with pixel dimensions inside auto-layout parents.
    if (props.width !== undefined && !props.layoutSizingHorizontal) {
        props.layoutSizingHorizontal = 'FIXED';
    }
    if (props.height !== undefined && !props.layoutSizingVertical) {
        props.layoutSizingVertical = 'FIXED';
    }

    // align-self → layoutAlign
    const alignSelf = styles.get('align-self');
    if (alignSelf === 'flex-start') props.layoutAlign = 'MIN';
    else if (alignSelf === 'center') props.layoutAlign = 'CENTER';
    else if (alignSelf === 'flex-end') props.layoutAlign = 'MAX';
    else if (alignSelf === 'stretch') props.layoutAlign = 'STRETCH';

    // Min/max dimensions
    const minWidth = parsePx(styles.get('min-width'));
    if (minWidth !== undefined) props.minWidth = minWidth;
    const maxWidth = parsePx(styles.get('max-width'));
    if (maxWidth !== undefined) props.maxWidth = maxWidth;
    const minHeight = parsePx(styles.get('min-height'));
    if (minHeight !== undefined) props.minHeight = minHeight;
    const maxHeight = parsePx(styles.get('max-height'));
    if (maxHeight !== undefined) props.maxHeight = maxHeight;

    // Rotation from transform
    const transform = styles.get('transform');
    if (transform) {
        const rotation = parseRotationFromTransform(transform);
        if (rotation !== undefined) props.rotation = rotation;
    }

    // Effects from box-shadow, filter, backdrop-filter
    const effects: any[] = [];
    const boxShadow = styles.get('box-shadow');
    if (boxShadow) {
        const shadowEffects = parseBoxShadowToEffects(boxShadow);
        effects.push(...shadowEffects);
    }
    const filter = styles.get('filter');
    if (filter) {
        const blurRadius = parseBlurFromFilter(filter);
        if (blurRadius !== undefined) {
            effects.push({ type: 'LAYER_BLUR', radius: blurRadius, visible: true });
        }
    }
    const backdropFilter = styles.get('backdrop-filter') || styles.get('-webkit-backdrop-filter');
    if (backdropFilter) {
        const blurRadius = parseBlurFromFilter(backdropFilter);
        if (blurRadius !== undefined) {
            effects.push({ type: 'BACKGROUND_BLUR', radius: blurRadius, visible: true });
        }
    }
    if (effects.length > 0) {
        props.effects = effects;
    }

    // flex-wrap → layoutWrap
    const flexWrap = styles.get('flex-wrap');
    if (flexWrap === 'wrap') {
        props.layoutWrap = 'WRAP';
    }

    return props;
}

// ─── Text Style Extraction ───────────────────────────────────────────────────

interface FigmaTextProps {
    fontName?: { family: string; style: string };
    fontSize?: number;
    fontWeight?: number;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };
    lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' } | { unit: 'AUTO' };
    textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
    textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
}

const FIGMA_WEIGHT_TO_STYLE: Record<number, string> = {
    100: 'Thin',
    200: 'Extra Light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semi Bold',
    700: 'Bold',
    800: 'Extra Bold',
    900: 'Black',
};

function fontWeightAndStyleToFigmaStyle(weight: number | undefined, isItalic: boolean): string {
    const base = (weight !== undefined && FIGMA_WEIGHT_TO_STYLE[weight]) || 'Regular';
    if (!isItalic) return base;
    if (base === 'Regular') return 'Italic';
    return `${base} Italic`;
}

function stylesToTextProps(styles: Map<string, string>): FigmaTextProps {
    const props: FigmaTextProps = {};

    // Font weight (parse early — needed for fontName.style)
    const fontWeight = styles.get('font-weight');
    let weightValue: number | undefined;
    if (fontWeight !== undefined) {
        const w = parseInt(fontWeight);
        if (!isNaN(w)) {
            weightValue = w;
            props.fontWeight = w;
        }
    }

    // Font
    const fontFamily = styles.get('font-family');
    if (fontFamily) {
        const family = fontFamily.replace(/["']/g, '').split(',')[0].trim();
        const isItalic = styles.get('font-style') === 'italic';
        props.fontName = { family, style: fontWeightAndStyleToFigmaStyle(weightValue, isItalic) };
    }

    const fontSize = parsePx(styles.get('font-size'));
    if (fontSize !== undefined) props.fontSize = fontSize;

    const textAlign = styles.get('text-align');
    if (textAlign === 'center') props.textAlignHorizontal = 'CENTER';
    else if (textAlign === 'right') props.textAlignHorizontal = 'RIGHT';
    else if (textAlign === 'justify') props.textAlignHorizontal = 'JUSTIFIED';
    else if (textAlign) props.textAlignHorizontal = 'LEFT';

    const letterSpacing = parsePx(styles.get('letter-spacing'));
    if (letterSpacing !== undefined) {
        props.letterSpacing = { value: letterSpacing, unit: 'PIXELS' };
    }

    const lineHeight = styles.get('line-height');
    if (lineHeight === 'normal') {
        props.lineHeight = { unit: 'AUTO' };
    } else {
        const lhPx = parsePx(lineHeight);
        if (lhPx !== undefined) {
            props.lineHeight = { value: lhPx, unit: 'PIXELS' };
        } else {
            const lhPct = parsePercent(lineHeight);
            if (lhPct !== undefined) {
                props.lineHeight = { value: lhPct, unit: 'PERCENT' };
            }
        }
    }

    const textDecoration = styles.get('text-decoration');
    if (textDecoration === 'underline') props.textDecoration = 'UNDERLINE';
    else if (textDecoration === 'line-through') props.textDecoration = 'STRIKETHROUGH';

    const textTransform = styles.get('text-transform');
    if (textTransform === 'uppercase') props.textCase = 'UPPER';
    else if (textTransform === 'lowercase') props.textCase = 'LOWER';
    else if (textTransform === 'capitalize') props.textCase = 'TITLE';

    return props;
}

// ─── Jay Attribute Extraction ────────────────────────────────────────────────

/**
 * Extracts Jay-specific data from HTML element attributes and converts to pluginData.
 * Recognizes the Jay directives: forEach, trackBy, if, ref, and data-figma-* attributes.
 */
function extractJayPluginData(element: HTMLElement): { [key: string]: string } | undefined {
    const pluginData: { [key: string]: string } = {};
    let hasData = false;

    // forEach → repeater
    const forEach = element.getAttribute('forEach') || element.getAttribute('foreach');
    if (forEach) {
        pluginData['forEach'] = forEach;
        hasData = true;
    }

    // trackBy
    const trackBy = element.getAttribute('trackBy') || element.getAttribute('trackby');
    if (trackBy) {
        pluginData['trackBy'] = trackBy;
        hasData = true;
    }

    // if → condition
    const ifAttr = element.getAttribute('if');
    if (ifAttr) {
        pluginData['if'] = ifAttr;
        hasData = true;
    }

    // ref → interactive reference
    const ref = element.getAttribute('ref');
    if (ref) {
        pluginData['ref'] = ref;
        hasData = true;
    }

    // data-figma-id → preserve original Figma ID if present
    const figmaId = element.getAttribute('data-figma-id');
    if (figmaId) {
        pluginData['originalFigmaId'] = figmaId;
        hasData = true;
    }

    // data-figma-type → preserve original Figma type
    const figmaType = element.getAttribute('data-figma-type');
    if (figmaType) {
        pluginData['originalFigmaType'] = figmaType;
        hasData = true;
    }

    // data-page-url → jpage marker
    const pageUrl = element.getAttribute('data-page-url');
    if (pageUrl !== null && pageUrl !== undefined) {
        pluginData['jpage'] = 'true';
        pluginData['urlRoute'] = pageUrl;
        hasData = true;
    }

    // Semantic HTML tag name (if not div)
    const tagName = element.rawTagName?.toLowerCase();
    if (tagName && tagName !== 'div' && tagName !== 'section') {
        pluginData['semanticHtml'] = tagName;
        hasData = true;
    }

    return hasData ? pluginData : undefined;
}

/**
 * Extracts binding expressions from element attributes.
 * E.g., src="{product.imageUrl}" → { attribute: "src", path: "product.imageUrl" }
 */
function extractAttributeBindings(
    element: HTMLElement,
): Array<{ attribute: string; path: string }> {
    const bindings: Array<{ attribute: string; path: string }> = [];
    const attrs = element.attributes;

    const jayDirectives = new Set([
        'style',
        'class',
        'id',
        'forEach',
        'foreach',
        'trackBy',
        'trackby',
        'if',
        'ref',
        'data-figma-id',
        'data-figma-type',
        'data-page-url',
        'data-name',
        'aria-label',
        'slowForEach',
        'slowforeach',
        'jayIndex',
        'jayindex',
        'jayTrackBy',
        'jaytrackby',
        'when-resolved',
        'when-loading',
        'when-rejected',
    ]);

    for (const [attrName, attrValue] of Object.entries(attrs)) {
        if (jayDirectives.has(attrName)) continue;

        const bindingMatch = attrValue.match(/^\{([^}]+)\}$/);
        if (bindingMatch) {
            bindings.push({ attribute: attrName, path: bindingMatch[1] });
        }
    }

    return bindings;
}

// ─── Node Conversion ─────────────────────────────────────────────────────────

let nodeIdCounter = 0;

function generateNodeId(): string {
    return `jay-import:${nodeIdCounter++}`;
}

// ─── Variant / Component Set Detection ───────────────────────────────────────

interface ParsedIfCondition {
    tagName: string; // e.g. "status"
    value: string; // e.g. "ACTIVE"
}

/**
 * Parses a simple enum `if` condition like "status == ACTIVE" into { tagName, value }.
 * Returns null if the condition is not a simple enum equality check.
 */
function parseIfCondition(ifExpr: string): ParsedIfCondition | null {
    const match = ifExpr.trim().match(/^(\w+)\s*==\s*(\w+)$/);
    if (!match) return null;
    return { tagName: match[1], value: match[2] };
}

interface VariantGroup {
    tagName: string; // The tag being switched on (e.g. "status")
    propertyName: string; // Figma property name (capitalized tag, e.g. "Status")
    enumValues: string[]; // All enum values from contract (e.g. ["ACTIVE", "INACTIVE"])
    elements: HTMLElement[]; // The sibling elements in this group
    elementValues: string[]; // The value each element maps to
}

/**
 * Looks up a tag in the headless imports' contracts and returns it if it's a variant tag.
 */
function findVariantTag(tagName: string): { tag: ContractTag; contract: Contract } | null {
    for (const imp of currentHeadlessImports) {
        if (!imp.contract) continue;
        for (const tag of imp.contract.tags) {
            if (tag.tag === tagName && tag.type.includes(ContractTagType.variant)) {
                return { tag, contract: imp.contract };
            }
        }
    }
    return null;
}

/**
 * Extract enum values from a ContractTag's dataType string like "enum (ACTIVE | INACTIVE)".
 */
function extractEnumValuesFromTag(tag: ContractTag): string[] {
    if (!tag.dataType) return [];
    // dataType is a JayType, which for enums is a string like "enum (ACTIVE | INACTIVE)"
    const dtStr = typeof tag.dataType === 'string' ? tag.dataType : String(tag.dataType);
    try {
        return parseEnumValues(dtStr);
    } catch {
        // Fallback: manual parse "enum (A | B | C)"
        const match = dtStr.match(/^enum\s*\(([^)]+)\)$/);
        if (match) {
            return match[1].split('|').map((v) => v.trim());
        }
        return [];
    }
}

/**
 * Scans a list of sibling child elements and detects variant groups:
 * consecutive siblings that have `if="tag == VALUE"` with the same tag,
 * where that tag is a `variant` type in the contract.
 *
 * Returns a map from the index of the FIRST element in each group to the VariantGroup.
 * Elements that are part of a group (but not the first) are in `consumedIndices`.
 */
function detectVariantGroups(children: HTMLElement[]): {
    groups: Map<number, VariantGroup>;
    consumedIndices: Set<number>;
} {
    const groups = new Map<number, VariantGroup>();
    const consumedIndices = new Set<number>();

    let i = 0;
    while (i < children.length) {
        const child = children[i];
        const ifAttr = child.getAttribute?.('if');
        if (!ifAttr) {
            i++;
            continue;
        }

        const parsed = parseIfCondition(ifAttr);
        if (!parsed) {
            i++;
            continue;
        }

        // Check if this tag is a variant in the contract
        const variantInfo = findVariantTag(parsed.tagName);
        if (!variantInfo) {
            i++;
            continue;
        }

        // Found a variant element — scan ahead for more siblings with the same tag
        const groupElements: HTMLElement[] = [child];
        const groupValues: string[] = [parsed.value];
        let j = i + 1;
        while (j < children.length) {
            const sibling = children[j];
            const siblingIf = sibling.getAttribute?.('if');
            if (!siblingIf) break;
            const siblingParsed = parseIfCondition(siblingIf);
            if (!siblingParsed || siblingParsed.tagName !== parsed.tagName) break;
            groupElements.push(sibling);
            groupValues.push(siblingParsed.value);
            j++;
        }

        // Only form a group if we have 2+ siblings (a single if is not a variant set)
        if (groupElements.length >= 2) {
            const enumValues = extractEnumValuesFromTag(variantInfo.tag);
            const group: VariantGroup = {
                tagName: parsed.tagName,
                propertyName: parsed.tagName, // Use the tag name as-is (lowercase)
                enumValues: enumValues.length > 0 ? enumValues : groupValues,
                elements: groupElements,
                elementValues: groupValues,
            };
            groups.set(i, group);
            for (let k = i; k < j; k++) {
                consumedIndices.add(k);
            }
        }

        i = j;
    }

    return { groups, consumedIndices };
}

/**
 * Converts a variant group into COMPONENT_SET + COMPONENT children, plus an INSTANCE node.
 * Returns the array of FigmaVendorDocument nodes to insert (component set + instance).
 */
function convertVariantGroup(group: VariantGroup): FigmaVendorDocument[] {
    const componentSetId = generateNodeId();

    // Convert each element into a COMPONENT node
    const components: FigmaVendorDocument[] = group.elements.map((el, idx) => {
        const variantValue = group.elementValues[idx];
        // Convert the element normally first, then override type and add variant props
        const converted = convertElement(el);
        if (!converted) {
            // Fallback: empty component
            return {
                id: generateNodeId(),
                name: `${group.propertyName}=${variantValue}`,
                type: 'COMPONENT',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                variantProperties: { [group.propertyName]: variantValue },
            } as FigmaVendorDocument;
        }

        // Override to COMPONENT type — remove `if` from pluginData since it's now structural
        const cleanPluginData = converted.pluginData
            ? (() => {
                  const pd = { ...converted.pluginData };
                  delete pd['if'];
                  return Object.keys(pd).length > 0 ? pd : undefined;
              })()
            : undefined;

        return {
            ...converted,
            name: `${group.propertyName}=${variantValue}`,
            type: 'COMPONENT',
            variantProperties: { [group.propertyName]: variantValue },
            pluginData: cleanPluginData,
        } as FigmaVendorDocument;
    });

    // Build componentPropertyDefinitions (placed on the INSTANCE)
    const componentPropertyDefinitions: {
        [propertyName: string]: {
            type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
            defaultValue: string;
            variantOptions: string[];
        };
    } = {
        [group.propertyName]: {
            type: 'VARIANT' as const,
            defaultValue: group.enumValues[0] || group.elementValues[0],
            variantOptions: group.enumValues,
        },
    };

    const componentSet: FigmaVendorDocument = {
        id: componentSetId,
        name: group.propertyName,
        type: 'COMPONENT_SET',
        x: 0,
        y: 0,
        children: components,
    };

    // Create an INSTANCE that references the component set
    const instance: FigmaVendorDocument = {
        id: generateNodeId(),
        name: group.propertyName,
        type: 'INSTANCE',
        x: 0,
        y: 0,
        componentSetId,
        componentPropertyDefinitions,
    };

    return [componentSet, instance];
}

/**
 * Checks if an HTML element is effectively a text-like element
 * (a leaf element with only text content, or a known text-like semantic element)
 */
function isTextElement(element: HTMLElement): boolean {
    const tag = element.rawTagName?.toLowerCase();

    // Explicit text-like tags
    if (['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'a'].includes(tag)) {
        return true;
    }

    // A div with no child elements, only text content
    if (tag === 'div' && element.childNodes.length > 0) {
        const hasOnlyText = element.childNodes.every(
            (child) => child.nodeType === NodeType.TEXT_NODE,
        );
        if (hasOnlyText && element.text.trim()) {
            return true;
        }
    }

    return false;
}

/**
 * Builds non-default Figma text properties that can be inferred from CSS context.
 *
 * Design Log #91.1 Figma Defaults Research:
 * Removed constant defaults that match Figma's own defaults — the deserializer
 * handles missing values gracefully (uses Figma defaults). Only emit properties
 * that are NON-default and can be inferred from CSS signals.
 *
 * Removed (Figma defaults, no consumer needs them):
 * - textAlignVertical: "TOP" — Figma default
 * - letterSpacing: {value:0, unit:"PERCENT"} — Figma default
 * - textCase: "ORIGINAL" — deserializer doesn't read it
 * - textTruncation: "DISABLED" — deserializer doesn't read it
 * - textAutoResize: "WIDTH_AND_HEIGHT" — Figma default
 *
 * Kept (non-default, inferred from CSS):
 * - textAutoResize: "HEIGHT" — when text has fixed pixel width (Figma: fixed-width text box)
 */
function buildTextDefaults(
    _textProps: FigmaTextProps,
    layoutProps: FigmaLayoutProps,
): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    // textAutoResize: "HEIGHT" when text has an explicit pixel width but no explicit height.
    // This means the text box has a fixed width and auto-resizes height to fit content.
    // The Figma default "WIDTH_AND_HEIGHT" is omitted (deserializer uses Figma default).
    if (
        layoutProps.layoutSizingHorizontal === 'FIXED' &&
        layoutProps.width !== undefined &&
        layoutProps.layoutSizingVertical !== 'FIXED'
    ) {
        defaults.textAutoResize = 'HEIGHT';
    }

    return defaults;
}

/**
 * Converts a text HTML element to a FigmaVendorDocument TEXT node
 */
function convertTextElement(element: HTMLElement): FigmaVendorDocument {
    const styles = parseStyleString(element.getAttribute('style') || '');
    const layoutProps = stylesToFigmaProps(styles);
    const textProps = stylesToTextProps(styles);
    const pluginData = extractJayPluginData(element);

    const textContent = element.text.trim();

    const colorStr = styles.get('color');
    const textFill = colorStr ? parseColorToFill(colorStr) : undefined;

    // Apply inferred non-default text properties
    const textDefaults = buildTextDefaults(textProps, layoutProps);

    return {
        id: generateNodeId(),
        name: textContent.substring(0, 30) || 'Text',
        type: 'TEXT',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width ?? 100,
        height: layoutProps.height ?? 20,
        characters: textContent,
        ...textProps,
        ...textDefaults,
        fills: textFill ? [textFill] : undefined,
        opacity: layoutProps.opacity,
        rotation: layoutProps.rotation,
        effects: layoutProps.effects,
        layoutSizingHorizontal: layoutProps.layoutSizingHorizontal,
        layoutSizingVertical: layoutProps.layoutSizingVertical,
        pluginData,
    };
}

/**
 * Converts an <img> element to a FigmaVendorDocument node
 */
function convertImageElement(element: HTMLElement): FigmaVendorDocument {
    const styles = parseStyleString(element.getAttribute('style') || '');
    const layoutProps = stylesToFigmaProps(styles);
    const pluginData = extractJayPluginData(element) || {};

    const src = element.getAttribute('src');
    const alt = element.getAttribute('alt') || '';

    pluginData['semanticHtml'] = 'img';

    let fills: any[] = [];
    if (src && !src.startsWith('{')) {
        // Static image — extract imageRef from the path (e.g., "/images/200:1_FILL.png" → "200:1_FILL")
        pluginData['staticImageUrl'] = src;
        const filename = src.split('/').pop() || '';
        const imageRef = filename.replace(/\.[^.]+$/, ''); // strip extension
        fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageRef }];
    } else if (src && src.startsWith('{') && src.endsWith('}')) {
        // Dynamic image — store binding expression
        const bindingExpr = src.slice(1, -1); // strip { and }
        pluginData['attributeBindings'] = JSON.stringify({ src: bindingExpr });
    }

    return {
        id: pluginData?.['originalFigmaId'] || generateNodeId(),
        name: alt || 'Image',
        type: 'RECTANGLE',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width ?? 100,
        height: layoutProps.height ?? 100,
        fills,
        cornerRadius: layoutProps.cornerRadius,
        opacity: layoutProps.opacity,
        rotation: layoutProps.rotation,
        effects: layoutProps.effects,
        layoutSizingHorizontal: layoutProps.layoutSizingHorizontal,
        layoutSizingVertical: layoutProps.layoutSizingVertical,
        pluginData,
    };
}

/**
 * Converts a data-figma-type="vector" wrapper element to a VECTOR node.
 * Serializes the inner <svg> back to a string as svgContent.
 */
function convertVectorElement(element: HTMLElement): FigmaVendorDocument {
    const styles = parseStyleString(element.getAttribute('style') || '');
    const layoutProps = stylesToFigmaProps(styles);
    const pluginData = extractJayPluginData(element) || {};

    // Find the <svg> child and serialize it
    const svgChild = element.querySelector('svg');
    const svgContent = svgChild ? svgChild.outerHTML : undefined;

    return {
        id: pluginData?.['originalFigmaId'] || generateNodeId(),
        name: element.getAttribute('data-name') || 'Vector',
        type: 'VECTOR',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width,
        height: layoutProps.height,
        ...(svgContent ? { svgContent } : {}),
        pluginData,
    };
}

/**
 * Detects the frame-wrapping-text pattern from the forward converter:
 *   <div data-figma-id="..." style="font-styles; dimensions">
 *     <div style="font-styles">text content</div>
 *   </div>
 * Returns a collapsed TEXT node, or null if the pattern doesn't match.
 */
function tryCollapseTextWrapper(element: HTMLElement): FigmaVendorDocument | null {
    const tag = element.rawTagName?.toLowerCase();
    if (tag !== 'div') return null;

    // Must have exactly one child element (the inner text div)
    const childElements = element.childNodes.filter(
        (child) => child.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
    if (childElements.length !== 1) return null;

    const innerChild = childElements[0];
    const innerTag = innerChild.rawTagName?.toLowerCase();
    if (innerTag !== 'div') return null;

    // The inner child must be text-only (no sub-elements)
    if (!isTextElement(innerChild)) return null;

    // The outer element should have text-related styles (font-family, font-size, etc.)
    const outerStyles = parseStyleString(element.getAttribute('style') || '');
    const hasTextStyles =
        outerStyles.has('font-family') ||
        outerStyles.has('font-size') ||
        outerStyles.has('font-weight');
    if (!hasTextStyles) return null;

    // Collapse: use inner child's text content + styles, outer element's dimensions and id
    const innerStyles = parseStyleString(innerChild.getAttribute('style') || '');
    const outerLayoutProps = stylesToFigmaProps(outerStyles);
    const textProps = stylesToTextProps(innerStyles);
    const pluginData = extractJayPluginData(element) || {};

    const textContent = innerChild.text.trim();

    // Parse text color from inner styles (same as convertTextElement)
    const colorStr = innerStyles.get('color');
    const textFill = colorStr ? parseColorToFill(colorStr) : undefined;

    // Apply inferred non-default text properties
    const textDefaults = buildTextDefaults(textProps, outerLayoutProps);

    return {
        id: pluginData?.['originalFigmaId'] || generateNodeId(),
        name: textContent || 'Text',
        type: 'TEXT',
        x: outerLayoutProps.x ?? 0,
        y: outerLayoutProps.y ?? 0,
        width: outerLayoutProps.width ?? 100,
        height: outerLayoutProps.height ?? 20,
        characters: textContent,
        ...textProps,
        ...textDefaults,
        fills: textFill ? [textFill] : undefined,
        pluginData: Object.keys(pluginData).length > 0 ? pluginData : undefined,
    } as FigmaVendorDocument;
}

/**
 * Converts an HTML element and its children to a FigmaVendorDocument tree
 */
function convertElement(element: HTMLElement): FigmaVendorDocument | null {
    const tag = element.rawTagName?.toLowerCase();
    if (!tag) return null;

    // Skip script, style, meta, link elements
    if (['script', 'style', 'meta', 'link', 'title'].includes(tag)) {
        return null;
    }

    // Handle <img> elements
    if (tag === 'img') {
        return convertImageElement(element);
    }

    // Handle vector elements (data-figma-type="vector" wrapping an <svg>)
    const figmaTypeAttr = element.getAttribute('data-figma-type');
    if (figmaTypeAttr === 'vector') {
        return convertVectorElement(element);
    }

    // Handle frame-wrapping-text pattern: a div/frame with a single child div that is text-only.
    // This is the forward converter's pattern for Figma TEXT nodes.
    // Collapse into a single TEXT node using the outer frame's dimensions and id.
    const collapsedText = tryCollapseTextWrapper(element);
    if (collapsedText) {
        return collapsedText;
    }

    // Handle text-like elements
    if (isTextElement(element)) {
        return convertTextElement(element);
    }

    // Handle <section> (Jay Page section)
    if (tag === 'section') {
        return convertSectionElement(element);
    }

    // Default: treat as FRAME container
    return convertFrameElement(element);
}

/**
 * Converts a <section> element (Jay Page section) to a FigmaVendorDocument
 */
function convertSectionElement(element: HTMLElement): FigmaVendorDocument {
    const styles = parseStyleString(element.getAttribute('style') || '');
    const layoutProps = stylesToFigmaProps(styles);
    const pluginData = extractJayPluginData(element) || {};

    const children: FigmaVendorDocument[] = [];
    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            const converted = convertElement(child as HTMLElement);
            if (converted) children.push(converted);
        }
    }

    return {
        id: pluginData['originalFigmaId'] || generateNodeId(),
        name: element.getAttribute('data-name') || 'Section',
        type: 'SECTION',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width ?? 1440,
        height: layoutProps.height ?? 900,
        children: children.length > 0 ? children : undefined,
        pluginData: Object.keys(pluginData).length > 0 ? pluginData : undefined,
    };
}

/**
 * Converts a generic HTML element to a FigmaVendorDocument FRAME node
 */
function convertFrameElement(element: HTMLElement): FigmaVendorDocument {
    const styles = parseStyleString(element.getAttribute('style') || '');
    const layoutProps = stylesToFigmaProps(styles);
    const pluginData = extractJayPluginData(element);

    // Extract attribute bindings and store them
    const attrBindings = extractAttributeBindings(element);
    if (attrBindings.length > 0 && pluginData) {
        pluginData['attributeBindings'] = JSON.stringify(attrBindings);
    }

    // Convert children — with variant group detection
    const children: FigmaVendorDocument[] = [];

    // Collect element children for variant group analysis
    const elementChildren: HTMLElement[] = [];
    const allChildNodes = element.childNodes;
    for (const child of allChildNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            elementChildren.push(child as HTMLElement);
        }
    }

    // Detect variant groups among element children
    const { groups: variantGroups, consumedIndices } = detectVariantGroups(elementChildren);

    // Process all child nodes, inserting variant groups where detected
    let elementIdx = 0;
    for (const child of allChildNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            const currentIdx = elementIdx;
            elementIdx++;

            // If this element starts a variant group, emit the group
            if (variantGroups.has(currentIdx)) {
                const group = variantGroups.get(currentIdx)!;
                const groupNodes = convertVariantGroup(group);
                children.push(...groupNodes);
                continue;
            }

            // If this element is consumed by a variant group (not the first), skip it
            if (consumedIndices.has(currentIdx)) {
                continue;
            }

            // Normal element conversion
            const converted = convertElement(child as HTMLElement);
            if (converted) children.push(converted);
        } else if (child.nodeType === NodeType.TEXT_NODE) {
            const text = child.text.trim();
            if (text) {
                // Inline text nodes become TEXT children
                const textNode: FigmaVendorDocument = {
                    id: generateNodeId(),
                    name: text.substring(0, 30),
                    type: 'TEXT',
                    characters: text,
                    x: 0,
                    y: 0,
                    width: layoutProps.width ?? 100,
                    height: 20,
                };
                children.push(textNode);
            }
        }
    }

    // Determine name from data attributes or element content
    const figmaType = pluginData?.['originalFigmaType'] as string | undefined;
    const name =
        element.getAttribute('data-name') ||
        element.getAttribute('aria-label') ||
        (figmaType
            ? figmaType.charAt(0).toUpperCase() + figmaType.slice(1)
            : element.rawTagName || 'Frame');

    // Map data-figma-type to Figma node type
    const FIGMA_TYPE_MAP: Record<string, string> = { group: 'GROUP', frame: 'FRAME' };
    const nodeType = (figmaType && FIGMA_TYPE_MAP[figmaType.toLowerCase()]) || 'FRAME';

    return {
        id: pluginData?.['originalFigmaId'] || generateNodeId(),
        name,
        type: nodeType,
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width,
        height: layoutProps.height,
        fills: layoutProps.fills,
        strokes: layoutProps.strokes,
        strokeWeight: layoutProps.strokeWeight,
        strokeAlign: layoutProps.strokeAlign,
        strokeTopWeight: layoutProps.strokeTopWeight,
        strokeRightWeight: layoutProps.strokeRightWeight,
        strokeBottomWeight: layoutProps.strokeBottomWeight,
        strokeLeftWeight: layoutProps.strokeLeftWeight,
        cornerRadius: layoutProps.cornerRadius,
        topLeftRadius: layoutProps.topLeftRadius,
        topRightRadius: layoutProps.topRightRadius,
        bottomLeftRadius: layoutProps.bottomLeftRadius,
        bottomRightRadius: layoutProps.bottomRightRadius,
        layoutMode: layoutProps.layoutMode,
        primaryAxisAlignItems: layoutProps.primaryAxisAlignItems,
        counterAxisAlignItems: layoutProps.counterAxisAlignItems,
        itemSpacing: layoutProps.itemSpacing,
        paddingLeft: layoutProps.paddingLeft,
        paddingRight: layoutProps.paddingRight,
        paddingTop: layoutProps.paddingTop,
        paddingBottom: layoutProps.paddingBottom,
        opacity: layoutProps.opacity,
        clipsContent: layoutProps.clipsContent,
        overflowDirection: layoutProps.overflowDirection,
        layoutSizingHorizontal: layoutProps.layoutSizingHorizontal,
        layoutSizingVertical: layoutProps.layoutSizingVertical,
        layoutAlign: layoutProps.layoutAlign,
        layoutWrap: layoutProps.layoutWrap,
        layoutPositioning: layoutProps.layoutPositioning,
        rotation: layoutProps.rotation,
        effects: layoutProps.effects,
        minWidth: layoutProps.minWidth,
        maxWidth: layoutProps.maxWidth,
        minHeight: layoutProps.minHeight,
        maxHeight: layoutProps.maxHeight,
        children: children.length > 0 ? children : undefined,
        pluginData: pluginData && Object.keys(pluginData).length > 0 ? pluginData : undefined,
    };
}

// ─── Main Conversion Entry Point ─────────────────────────────────────────────

/**
 * Converts a compiler-parsed JayHtmlSourceFile to a FigmaVendorDocument tree.
 *
 * Uses the compiler's parsed output which provides:
 * - body: The parsed DOM tree (HTMLElement) with all Jay directives
 * - headlessImports: Resolved headless component references (plugin, contract, key)
 * - contract: The page's contract data
 * - css: Extracted CSS content
 *
 * The resulting document represents a Jay Page section with the page content
 * as its child frame - matching the structure the Figma plugin expects.
 *
 * @param parsedJayHtml - The compiler-parsed jay-html source file
 * @param pageUrl - The page URL/route
 * @returns A FigmaVendorDocument representing the page
 */
export function convertJayHtmlToFigmaDoc(
    parsedJayHtml: JayHtmlSourceFile,
    pageUrl: string,
): FigmaVendorDocument {
    // Reset ID counter and set module-level context for each conversion
    nodeIdCounter = 0;
    currentHeadlessImports = parsedJayHtml.headlessImports || [];

    const { body, headlessImports } = parsedJayHtml;

    // Collect body element children for variant detection at the top level
    const bodyElementChildren: HTMLElement[] = [];
    for (const child of body.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            bodyElementChildren.push(child as HTMLElement);
        }
    }

    // Detect variant groups among top-level body children
    const { groups: bodyVariantGroups, consumedIndices: bodyConsumed } =
        detectVariantGroups(bodyElementChildren);

    // Convert body children into FigmaVendorDocument nodes
    const bodyChildren: FigmaVendorDocument[] = [];
    for (let i = 0; i < bodyElementChildren.length; i++) {
        if (bodyVariantGroups.has(i)) {
            const group = bodyVariantGroups.get(i)!;
            const groupNodes = convertVariantGroup(group);
            bodyChildren.push(...groupNodes);
            continue;
        }
        if (bodyConsumed.has(i)) {
            continue;
        }
        const converted = convertElement(bodyElementChildren[i]);
        if (converted) bodyChildren.push(converted);
    }

    // Determine page name from the source file metadata
    const pageName = parsedJayHtml.baseElementName || pageUrl || 'Imported Page';

    // If any child is already a SECTION with jpage, return it directly
    const existingSection = bodyChildren.find(
        (child) => child.type === 'SECTION' && child.pluginData?.['jpage'] === 'true',
    );
    if (existingSection) {
        return existingSection;
    }

    // Create a content FRAME that wraps all body children
    const contentFrame: FigmaVendorDocument = {
        id: generateNodeId(),
        name: 'Content',
        type: 'FRAME',
        x: 0,
        y: 0,
        width: 1440,
        height: computeContentHeight(bodyChildren),
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        children: bodyChildren,
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], // White background
    };

    // Build pluginData for the section from headless imports
    const sectionPluginData: { [key: string]: string } = {
        jpage: 'true',
        urlRoute: pageUrl,
    };

    // Preserve headless component information from the compiler's resolved imports
    if (headlessImports.length > 0) {
        const headlessInfo = headlessImports.map((imp) => ({
            key: imp.key,
            contractName: imp.contractName,
            codeLinkModule: imp.codeLink?.module,
        }));
        sectionPluginData['headlessImports'] = JSON.stringify(headlessInfo);
    }

    // Wrap in a SECTION node (Jay Page structure that Figma plugin expects)
    const sectionNode: FigmaVendorDocument = {
        id: generateNodeId(),
        name: `Jay Page: ${pageName}`,
        type: 'SECTION',
        x: 0,
        y: 0,
        width: 1440,
        height: computeContentHeight(bodyChildren),
        children: [contentFrame],
        pluginData: sectionPluginData,
    };

    return sectionNode;
}

/**
 * Computes an estimated content height from the children.
 * Uses the maximum bottom edge (y + height) of all children.
 */
function computeContentHeight(children: FigmaVendorDocument[]): number {
    let maxBottom = 0;
    for (const child of children) {
        const bottom = (child.y ?? 0) + (child.height ?? 0);
        if (bottom > maxBottom) maxBottom = bottom;
    }
    return Math.max(maxBottom, 900); // Minimum 900px height
}
