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
import type { JayHtmlSourceFile } from '@jay-framework/compiler-jay-html';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

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
    opacity?: number;
    clipsContent?: boolean;
    overflowDirection?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
    layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
}

/**
 * Converts CSS styles to Figma layout and visual properties
 */
function stylesToFigmaProps(styles: Map<string, string>): FigmaLayoutProps {
    const props: FigmaLayoutProps = {};

    // Position
    props.x = parsePx(styles.get('left'));
    props.y = parsePx(styles.get('top'));

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

    // Background color → fills
    const bgColor = styles.get('background-color') || styles.get('background');
    if (bgColor) {
        const fill = parseColorToFill(bgColor);
        if (fill) {
            props.fills = [fill];
        }
    }

    // Border → strokes
    const border = styles.get('border');
    if (border) {
        const borderParts = border.match(/^([\d.]+)px\s+\w+\s+(.*)/);
        if (borderParts) {
            props.strokeWeight = parseFloat(borderParts[1]);
            const strokeFill = parseColorToFill(borderParts[2]);
            if (strokeFill) {
                props.strokes = [strokeFill];
            }
        }
    }
    const borderColor = styles.get('border-color');
    if (borderColor && !props.strokes) {
        const strokeFill = parseColorToFill(borderColor);
        if (strokeFill) props.strokes = [strokeFill];
    }
    const borderWidth = parsePx(styles.get('border-width'));
    if (borderWidth !== undefined) props.strokeWeight = borderWidth;

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
    }
    if (overflowY === 'auto' || overflowY === 'scroll') {
        props.overflowDirection =
            props.overflowDirection === 'BOTH' || overflowX === 'auto' || overflowX === 'scroll'
                ? 'BOTH'
                : 'VERTICAL';
    }

    // Width/height sizing
    if (styles.get('width') === '100%') {
        props.layoutSizingHorizontal = 'FILL';
    }
    if (styles.get('height') === '100%') {
        props.layoutSizingVertical = 'FILL';
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

function stylesToTextProps(styles: Map<string, string>): FigmaTextProps {
    const props: FigmaTextProps = {};

    // Font
    const fontFamily = styles.get('font-family');
    if (fontFamily) {
        const family = fontFamily.replace(/["']/g, '').split(',')[0].trim();
        const fontStyle = styles.get('font-style') === 'italic' ? 'Italic' : 'Regular';
        props.fontName = { family, style: fontStyle };
    }

    const fontSize = parsePx(styles.get('font-size'));
    if (fontSize !== undefined) props.fontSize = fontSize;

    const fontWeight = styles.get('font-weight');
    if (fontWeight !== undefined) {
        const w = parseInt(fontWeight);
        if (!isNaN(w)) props.fontWeight = w;
    }

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
        fills: textFill ? [textFill] : undefined,
        opacity: layoutProps.opacity,
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
    if (src && !src.startsWith('{')) {
        pluginData['staticImageUrl'] = src;
    }

    return {
        id: generateNodeId(),
        name: alt || 'Image',
        type: 'FRAME',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width ?? 100,
        height: layoutProps.height ?? 100,
        fills: layoutProps.fills || [],
        cornerRadius: layoutProps.cornerRadius,
        clipsContent: true,
        pluginData,
    };
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

    // Convert children
    const children: FigmaVendorDocument[] = [];
    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
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
    const name =
        element.getAttribute('data-name') ||
        element.getAttribute('aria-label') ||
        (pluginData?.['originalFigmaType']
            ? `${pluginData['originalFigmaType']}`
            : element.rawTagName || 'Frame');

    return {
        id: pluginData?.['originalFigmaId'] || generateNodeId(),
        name,
        type: 'FRAME',
        x: layoutProps.x ?? 0,
        y: layoutProps.y ?? 0,
        width: layoutProps.width,
        height: layoutProps.height,
        fills: layoutProps.fills,
        strokes: layoutProps.strokes,
        strokeWeight: layoutProps.strokeWeight,
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
    // Reset ID counter for each conversion
    nodeIdCounter = 0;

    const { body, headlessImports } = parsedJayHtml;

    // Convert body children into FigmaVendorDocument nodes
    const bodyChildren: FigmaVendorDocument[] = [];
    for (const child of body.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            const converted = convertElement(child as HTMLElement);
            if (converted) bodyChildren.push(converted);
        }
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
