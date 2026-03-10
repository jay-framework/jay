import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { ImportIRDocument, ImportIRNode, ImportIRStyle, ImportIRFill } from './import-ir';

const DEFAULT_FONT_FAMILY = 'Inter';

function fontWeightToStyle(weight: number | undefined): string {
    if (!weight) return 'Regular';
    if (weight < 150) return 'Thin';
    if (weight < 250) return 'Extra Light';
    if (weight < 350) return 'Light';
    if (weight < 450) return 'Regular';
    if (weight < 550) return 'Medium';
    if (weight < 650) return 'Semi Bold';
    if (weight < 750) return 'Bold';
    if (weight < 850) return 'Extra Bold';
    return 'Black';
}

function cssAngleToFigmaTransform(
    cssDeg: number,
): [[number, number, number], [number, number, number]] {
    const rad = ((cssDeg - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const tx = 0.5 - 0.5 * cos + 0.5 * sin;
    const ty = 0.5 - 0.5 * sin - 0.5 * cos;
    return [
        [cos, -sin, tx],
        [sin, cos, ty],
    ];
}

function mapFillToFigma(fill: ImportIRFill): any {
    if (fill.type === 'SOLID') {
        const color = parseColor(fill.color);
        return { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
    }
    if (fill.type === 'GRADIENT_LINEAR') {
        return {
            type: 'GRADIENT_LINEAR',
            gradientTransform: cssAngleToFigmaTransform(fill.angle),
            gradientStops: fill.stops.map((s) => {
                const color = parseColor(s.color);
                return {
                    position: s.position,
                    color: { r: color.r, g: color.g, b: color.b, a: color.a },
                };
            }),
        };
    }
    return { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 };
}

function parseColor(cssColor: string): { r: number; g: number; b: number; a: number } {
    if (cssColor === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

    // #rgb
    const hex3 = cssColor.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (hex3) {
        return {
            r: parseInt(hex3[1] + hex3[1], 16) / 255,
            g: parseInt(hex3[2] + hex3[2], 16) / 255,
            b: parseInt(hex3[3] + hex3[3], 16) / 255,
            a: 1,
        };
    }

    // #rrggbb or #rrggbbaa
    const hex = cssColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
    if (hex) {
        return {
            r: parseInt(hex[1], 16) / 255,
            g: parseInt(hex[2], 16) / 255,
            b: parseInt(hex[3], 16) / 255,
            a: hex[4] ? parseInt(hex[4], 16) / 255 : 1,
        };
    }

    // rgb(r, g, b) — comma-separated
    const rgbMatch = cssColor.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1], 10) / 255,
            g: parseInt(rgbMatch[2], 10) / 255,
            b: parseInt(rgbMatch[3], 10) / 255,
            a: 1,
        };
    }

    // rgba(r, g, b, a) — comma-separated
    const rgbaMatch = cssColor.match(
        /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
    );
    if (rgbaMatch) {
        return {
            r: parseInt(rgbaMatch[1], 10) / 255,
            g: parseInt(rgbaMatch[2], 10) / 255,
            b: parseInt(rgbaMatch[3], 10) / 255,
            a: parseFloat(rgbaMatch[4]),
        };
    }

    // rgb(r g b) — modern space-separated syntax
    const rgbSpaceMatch = cssColor.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/);
    if (rgbSpaceMatch) {
        return {
            r: parseInt(rgbSpaceMatch[1], 10) / 255,
            g: parseInt(rgbSpaceMatch[2], 10) / 255,
            b: parseInt(rgbSpaceMatch[3], 10) / 255,
            a: 1,
        };
    }

    // rgb(r g b / a) — modern space-separated with alpha
    const rgbSlashMatch = cssColor.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/);
    if (rgbSlashMatch) {
        return {
            r: parseInt(rgbSlashMatch[1], 10) / 255,
            g: parseInt(rgbSlashMatch[2], 10) / 255,
            b: parseInt(rgbSlashMatch[3], 10) / 255,
            a: parseFloat(rgbSlashMatch[4]),
        };
    }

    // Fallback — default to near-black so text is always readable
    return { r: 0.13, g: 0.13, b: 0.13, a: 1 };
}

function mapStyleToFigmaProps(style: ImportIRStyle | undefined): Partial<FigmaVendorDocument> {
    if (!style) return {};

    const props: Partial<FigmaVendorDocument> = {};

    if (style.width !== undefined) props.width = style.width;
    if (style.height !== undefined) props.height = style.height;
    if (style.isAbsolute) {
        props.layoutPositioning = 'ABSOLUTE';
        if (style.x !== undefined) props.x = style.x;
        if (style.y !== undefined) props.y = style.y;
    }

    if (style.layoutMode) {
        if (style.layoutMode === 'grid') {
            props.layoutMode = 'GRID';
            if (style.gridColumnWidths && style.gridColumnWidths.length > 0) {
                const allEqual = style.gridColumnWidths.every(
                    (w) => Math.abs(w - style.gridColumnWidths![0]) < 1,
                );
                props.gridColumnsSizes = style.gridColumnWidths.map((w) =>
                    allEqual
                        ? { type: 'FLEX' as const, value: 1 }
                        : { type: 'FIXED' as const, value: w },
                );
            }
            if (style.gridRowHeights && style.gridRowHeights.length > 0) {
                props.gridRowsSizes = style.gridRowHeights.map((h) => ({
                    type: 'FIXED' as const,
                    value: h,
                }));
            }
            if (style.rowGap !== undefined) {
                props.counterAxisSpacing = style.rowGap;
            }
        } else if (style.layoutMode === 'row') {
            props.layoutMode = 'HORIZONTAL';
        } else if (style.layoutMode === 'column') {
            props.layoutMode = 'VERTICAL';
        } else {
            props.layoutMode = 'NONE';
        }
    }
    if (style.layoutWrap) {
        if (!props.layoutMode || props.layoutMode === 'NONE') {
            props.layoutMode = 'HORIZONTAL';
        }
        if (props.layoutMode === 'HORIZONTAL') {
            props.layoutWrap = 'WRAP';
        }
    }

    if (style.gap !== undefined) props.itemSpacing = style.gap;

    if (style.padding) {
        props.paddingTop = style.padding.top;
        props.paddingRight = style.padding.right;
        props.paddingBottom = style.padding.bottom;
        props.paddingLeft = style.padding.left;
    }

    // Build fills: explicit fills array takes priority, then backgroundColor fallback
    // Skip fully transparent backgrounds (a === 0) — they add noise in Figma
    if (style.fills && style.fills.length > 0) {
        const figmaFills = style.fills.map(mapFillToFigma);
        if (style.backgroundColor) {
            const bgColor = parseColor(style.backgroundColor);
            if (bgColor.a > 0) {
                figmaFills.unshift({
                    type: 'SOLID',
                    color: { r: bgColor.r, g: bgColor.g, b: bgColor.b },
                    opacity: bgColor.a,
                });
            }
        }
        props.fills = figmaFills;
    } else if (style.backgroundColor) {
        const color = parseColor(style.backgroundColor);
        if (color.a > 0) {
            props.fills = [
                {
                    type: 'SOLID',
                    color: { r: color.r, g: color.g, b: color.b },
                    opacity: color.a,
                },
            ];
        }
    }

    if (style.borderRadius !== undefined) props.cornerRadius = style.borderRadius;
    const hasCorners =
        style.topLeftRadius !== undefined ||
        style.topRightRadius !== undefined ||
        style.bottomLeftRadius !== undefined ||
        style.bottomRightRadius !== undefined;
    if (hasCorners) {
        props.topLeftRadius = style.topLeftRadius ?? 0;
        props.topRightRadius = style.topRightRadius ?? 0;
        props.bottomLeftRadius = style.bottomLeftRadius ?? 0;
        props.bottomRightRadius = style.bottomRightRadius ?? 0;
        if (props.cornerRadius === undefined) props.cornerRadius = 'MIXED';
    }
    if (style.clipsContent) props.clipsContent = true;
    if (style.opacity !== undefined) props.opacity = style.opacity;
    // Borders: check for per-side widths first, then uniform
    const hasPerSide =
        style.borderTopWidth !== undefined ||
        style.borderRightWidth !== undefined ||
        style.borderBottomWidth !== undefined ||
        style.borderLeftWidth !== undefined;
    const topW = style.borderTopWidth ?? 0;
    const rightW = style.borderRightWidth ?? 0;
    const bottomW = style.borderBottomWidth ?? 0;
    const leftW = style.borderLeftWidth ?? 0;
    const anyBorder = hasPerSide
        ? topW > 0 || rightW > 0 || bottomW > 0 || leftW > 0
        : style.borderWidth !== undefined && style.borderWidth > 0;

    if (anyBorder) {
        if (hasPerSide && !(topW === rightW && rightW === bottomW && bottomW === leftW)) {
            // Per-side stroke weights (Figma supports individual stroke weights)
            props.strokeWeight = Math.max(topW, rightW, bottomW, leftW);
            props.strokeTopWeight = topW;
            props.strokeRightWeight = rightW;
            props.strokeBottomWeight = bottomW;
            props.strokeLeftWeight = leftW;
        } else {
            props.strokeWeight = style.borderWidth ?? topW;
        }
        if (style.borderColor) {
            const color = parseColor(style.borderColor);
            props.strokes = [
                { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a },
            ];
        }
    }

    if (style.justifyContent) props.primaryAxisAlignItems = style.justifyContent;
    if (style.alignItems) {
        const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'> = {
            MIN: 'MIN',
            CENTER: 'CENTER',
            MAX: 'MAX',
            STRETCH: 'MIN',
        };
        props.counterAxisAlignItems = alignMap[style.alignItems] ?? 'MIN';
    }

    if (style.effects && style.effects.length > 0) {
        props.effects = style.effects.map((e) => {
            if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
                return { type: e.type, radius: e.radius, visible: true };
            }
            // e is now narrowed to DROP_SHADOW | INNER_SHADOW
            const shadow = e as Extract<typeof e, { color: string }>;
            const color = parseColor(shadow.color);
            return {
                type: shadow.type,
                color: { r: color.r, g: color.g, b: color.b, a: color.a },
                offset: shadow.offset,
                radius: shadow.radius,
                spread: shadow.spread ?? 0,
                visible: true,
            };
        });
    }

    if (style.flexGrow !== undefined && style.flexGrow > 0) {
        props.layoutGrow = style.flexGrow;
    }

    return props;
}

export const HIDDEN_VARIANT_MARKER = 'jay-hidden-variant';

/**
 * Pick a collision-safe hidden value for a variant dimension.
 * Starts with `_hidden_`, wrapping in extra underscores if it collides
 * with an actual variant option.
 */
function pickHiddenValue(existingValues: Set<string>): string {
    let value = '_hidden_';
    while (existingValues.has(value)) {
        value = `_${value}_`;
    }
    return value;
}

/**
 * Inject a _hidden_ dummy COMPONENT into a COMPONENT_SET so designers
 * can visualize the default (not-shown) state of conditional content.
 * The hidden component is marked with pluginData so export can skip it.
 */
function injectHiddenVariant(componentSet: FigmaVendorDocument): void {
    const defs = componentSet.componentPropertyDefinitions;
    if (!defs || !componentSet.children) return;

    const hiddenProps: Record<string, string> = {};

    for (const [dimName, def] of Object.entries(defs)) {
        const existingValues = new Set(def.variantOptions);
        const hiddenValue = pickHiddenValue(existingValues);
        hiddenProps[dimName] = hiddenValue;
        def.variantOptions.push(hiddenValue);
    }

    const variantKey = Object.entries(hiddenProps)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

    const hiddenComponent: FigmaVendorDocument = {
        id: `hidden-variant-${variantKey}`,
        type: 'COMPONENT',
        name: variantKey,
        variantProperties: hiddenProps,
        width: 1,
        height: 1,
        pluginData: { [HIDDEN_VARIANT_MARKER]: 'true' },
    };

    componentSet.children.push(hiddenComponent);
}

function adaptNode(node: ImportIRNode, index: number): FigmaVendorDocument {
    const name = node.name || `${node.kind.toLowerCase()}-${index}`;
    const base: FigmaVendorDocument = {
        id: node.id,
        name,
        type: 'FRAME',
        visible: node.visible ?? true,
    };

    switch (node.kind) {
        case 'SECTION': {
            base.type = 'SECTION';
            base.pluginData = base.pluginData || {};
            base.pluginData['jpage'] = 'true';
            break;
        }
        case 'FRAME': {
            base.type = 'FRAME';
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);

            // Set sizing modes for auto-layout frames
            if (styleProps.layoutMode && styleProps.layoutMode !== 'NONE') {
                base.layoutSizingHorizontal = node.style?.width !== undefined ? 'FIXED' : 'HUG';
                base.layoutSizingVertical = node.style?.height !== undefined ? 'FIXED' : 'HUG';
            }

            // text-align on frames → Figma primaryAxisAlignItems for vertical layouts
            if (node.style?.textAlignHorizontal === 'CENTER' && base.layoutMode === 'VERTICAL') {
                if (!base.primaryAxisAlignItems) {
                    base.counterAxisAlignItems = 'CENTER';
                }
            }

            // Preserve semantic HTML tag name
            if (node.tagName && node.tagName !== 'div') {
                base.pluginData = base.pluginData || {};
                base.pluginData['semanticHtml'] = node.tagName;
            }
            break;
        }
        case 'TEXT': {
            base.type = 'TEXT';
            base.textAutoResize = 'WIDTH_AND_HEIGHT';
            if (node.text) {
                base.characters = node.text.characters;
            }
            // Preserve semantic text tag (h1-h6, p, span, etc.)
            if (node.tagName && node.tagName !== 'div' && node.tagName !== 'span') {
                base.pluginData = base.pluginData || {};
                base.pluginData['semanticHtml'] = node.tagName;
            }
            const family = node.style?.fontFamily || DEFAULT_FONT_FAMILY;
            const weight = node.style?.fontWeight;
            const isItalic = node.style?.fontStyle === 'italic';
            const weightStyle = fontWeightToStyle(weight);
            base.fontName = {
                family,
                style: isItalic ? `${weightStyle} Italic` : weightStyle,
            };
            if (node.style?.fontSize) base.fontSize = node.style.fontSize;
            if (weight) base.fontWeight = weight;
            {
                const color = node.style?.textColor
                    ? parseColor(node.style.textColor)
                    : { r: 0.13, g: 0.13, b: 0.13, a: 1 };
                base.fills = [
                    {
                        type: 'SOLID',
                        color: { r: color.r, g: color.g, b: color.b },
                        opacity: color.a,
                    },
                ];
            }
            if (node.style?.lineHeight !== undefined) {
                base.lineHeight = { value: node.style.lineHeight, unit: 'PIXELS' };
            }
            if (node.style?.letterSpacing !== undefined) {
                base.letterSpacing = { value: node.style.letterSpacing, unit: 'PIXELS' };
            }
            if (node.style?.textAlignHorizontal) {
                base.textAlignHorizontal = node.style.textAlignHorizontal;
                if (node.style.textAlignHorizontal !== 'LEFT') {
                    base.textAutoResize = 'HEIGHT';
                    base.layoutSizingHorizontal = 'FILL';
                }
            }
            if (node.style?.textDecoration) base.textDecoration = node.style.textDecoration;
            if (node.style?.textCase) base.textCase = node.style.textCase;
            if (node.style?.textTruncation) base.textTruncation = node.style.textTruncation;
            break;
        }
        case 'IMAGE': {
            base.type = 'RECTANGLE';
            base.pluginData = base.pluginData || {};
            base.pluginData['semanticHtml'] = 'img';
            if (node.image?.src) {
                base.pluginData['imgSrc'] = node.image.src;
            }
            if (node.image?.alt) {
                base.pluginData['imgAlt'] = node.image.alt;
            }
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);

            // Visible placeholder: gray fill + border so images are identifiable
            if (!base.fills || base.fills.length === 0) {
                base.fills = [
                    {
                        type: 'SOLID',
                        color: { r: 0.91, g: 0.89, b: 0.87 },
                        opacity: 1,
                    },
                ];
            }
            if (!base.strokes || base.strokes.length === 0) {
                base.strokes = [
                    {
                        type: 'SOLID',
                        color: { r: 0.75, g: 0.73, b: 0.71 },
                        opacity: 1,
                    },
                ];
                base.strokeWeight = 1;
            }

            // Name includes truncated src for easy identification
            if (node.image?.src) {
                const srcName = node.image.src.split('/').pop()?.split('?')[0] || 'image';
                base.name = `[img] ${node.image.alt || srcName}`;
            } else {
                base.name = `[img] ${node.image?.alt || name}`;
            }
            break;
        }
        case 'COMPONENT': {
            base.type = 'COMPONENT';
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);
            if (node.variantProperties) {
                base.variantProperties = node.variantProperties;
            }
            break;
        }
        case 'COMPONENT_SET': {
            base.type = 'COMPONENT_SET';
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);
            if (node.componentPropertyDefinitions) {
                base.componentPropertyDefinitions = Object.fromEntries(
                    Object.entries(node.componentPropertyDefinitions).map(([k, v]) => [
                        k,
                        { type: 'VARIANT' as const, variantOptions: v.variantOptions },
                    ]),
                );
            }
            break;
        }
        case 'INSTANCE': {
            base.type = 'INSTANCE';
            if (node.mainComponentId) {
                base.mainComponentId = node.mainComponentId;
            }
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);
            break;
        }
        case 'VECTOR_PLACEHOLDER': {
            base.type = 'FRAME';
            const styleProps = mapStyleToFigmaProps(node.style);
            Object.assign(base, styleProps);
            base.pluginData = base.pluginData || {};
            base.pluginData['semanticHtml'] = 'svg';
            if (node.svgData) {
                base.pluginData['svgData'] = node.svgData;
            }
            break;
        }
    }

    if (node.className) {
        base.pluginData = base.pluginData || {};
        base.pluginData['className'] = node.className;
    }
    if (node.htmlAttributes && Object.keys(node.htmlAttributes).length > 0) {
        base.pluginData = base.pluginData || {};
        base.pluginData['htmlAttributes'] = JSON.stringify(node.htmlAttributes);
    }
    if (node.image?.src) {
        base.pluginData = base.pluginData || {};
        base.pluginData['imgSrc'] = node.image.src;
    }
    if (node.image?.alt) {
        base.pluginData = base.pluginData || {};
        base.pluginData['imgAlt'] = node.image.alt;
    }
    if (node.unsupportedCss && Object.keys(node.unsupportedCss).length > 0) {
        base.pluginData = base.pluginData || {};
        base.pluginData['jay-unsupported-css'] = JSON.stringify(node.unsupportedCss);
    }

    // Map bindings to pluginData
    if (node.bindings && node.bindings.length > 0) {
        base.pluginData = base.pluginData || {};
        const layerBindings = node.bindings.filter((b) => b.kind === 'layer').map((b) => b.binding);
        if (layerBindings.length > 0) {
            base.pluginData['jay-layer-bindings'] = JSON.stringify(layerBindings);
        }
    }

    // Recursively adapt children
    if (node.children && node.children.length > 0) {
        base.children = node.children.map((child, i) => adaptNode(child, i));
    }

    // Figma-only: inject _hidden_ dummy variant into component sets so designers
    // can see the default (hidden) state alongside real variant(s).
    // Skipped on export via the 'jay-hidden-variant' pluginData marker.
    if (base.type === 'COMPONENT_SET' && base.componentPropertyDefinitions && base.children) {
        injectHiddenVariant(base);
    }

    // CSS flexbox defaults applied to auto-layout children
    if (base.layoutMode && base.layoutMode !== 'NONE' && base.children) {
        const explicitAlign =
            base.counterAxisAlignItems === 'CENTER' || base.counterAxisAlignItems === 'MAX';
        for (const child of base.children) {
            // flex-grow > 0 → FILL on the primary axis (modern Figma API, replaces deprecated layoutGrow)
            if (child.layoutGrow && child.layoutGrow > 0) {
                if (base.layoutMode === 'HORIZONTAL') {
                    child.layoutSizingHorizontal = 'FILL';
                } else if (base.layoutMode === 'VERTICAL') {
                    child.layoutSizingVertical = 'FILL';
                }
            }
            // Cross-axis stretch (align-items: stretch is CSS default)
            if (!explicitAlign) {
                if (base.layoutMode === 'VERTICAL') {
                    if (!child.layoutSizingHorizontal || child.layoutSizingHorizontal === 'HUG') {
                        child.layoutSizingHorizontal = 'FILL';
                    }
                } else if (base.layoutMode === 'HORIZONTAL') {
                    if (!child.layoutSizingVertical || child.layoutSizingVertical === 'HUG') {
                        child.layoutSizingVertical = 'FILL';
                    }
                }
            }
        }
    }

    // Auto-layout sizing: ensure parent is large enough to contain children.
    // getBoundingClientRect() reports the element's CSS box, not its content overflow.
    // If children need more space than the parent's bounding rect, expand the parent.
    if (
        base.layoutMode &&
        base.layoutMode !== 'NONE' &&
        base.children &&
        base.children.length > 0
    ) {
        const padL = base.paddingLeft ?? 0;
        const padR = base.paddingRight ?? 0;
        const padT = base.paddingTop ?? 0;
        const padB = base.paddingBottom ?? 0;
        const gap = base.itemSpacing ?? 0;

        if (base.layoutMode === 'HORIZONTAL') {
            const childWidthSum = base.children.reduce((sum, c) => sum + (c.width ?? 0), 0);
            const neededW = padL + padR + childWidthSum + (base.children.length - 1) * gap;
            if (base.width && neededW > base.width) {
                console.log(
                    `[Adapter] Expanding ${base.name}: ${base.width} → ${neededW} (children: ${base.children.map((c) => `${c.name}:${c.width ?? '?'}`).join(', ')})`,
                );
                base.width = neededW;
            }
        } else if (base.layoutMode === 'VERTICAL') {
            const maxChildW = Math.max(...base.children.map((c) => c.width ?? 0));
            const neededW = padL + padR + maxChildW;
            if (base.width && neededW > base.width) base.width = neededW;

            const neededH =
                padT +
                padB +
                base.children.reduce((sum, c) => sum + (c.height ?? 0), 0) +
                (base.children.length - 1) * gap;
            if (base.height && neededH > base.height) base.height = neededH;
        }
    }

    // Grid children: set fixed column widths from grid-template-columns
    if (base.layoutMode === 'GRID' && node.style?.gridColumnWidths && base.children) {
        const colWidth = node.style.gridColumnWidths[0];
        if (colWidth && colWidth > 0) {
            for (const child of base.children) {
                if (!child.width) child.width = colWidth;
                child.layoutSizingHorizontal = 'FIXED';
            }
        }
    }

    return base;
}

export interface ImportReportWarning {
    elementId: string;
    elementName: string;
    feature: string;
    action: 'mapped' | 'approximated' | 'stored' | 'ignored';
    message: string;
}

export interface ImportReport {
    totalElements: number;
    importedElements: number;
    warnings: ImportReportWarning[];
    unsupportedCssCount: number;
}

function collectImportReport(irRoot: ImportIRNode): ImportReport {
    const warnings: ImportReportWarning[] = [];
    let totalElements = 0;
    let unsupportedCssCount = 0;

    function walk(node: ImportIRNode) {
        totalElements++;

        if (node.unsupportedCss) {
            const keys = Object.keys(node.unsupportedCss);
            unsupportedCssCount += keys.length;
            for (const prop of keys) {
                warnings.push({
                    elementId: node.id,
                    elementName: node.name || node.tagName || node.kind,
                    feature: prop,
                    action: 'stored',
                    message: `${prop}: ${node.unsupportedCss[prop]} stored in pluginData`,
                });
            }
        }

        if (node.warnings) {
            for (const w of node.warnings) {
                if (w.startsWith('CSS_DYNAMIC_VALUE:')) {
                    warnings.push({
                        elementId: node.id,
                        elementName: node.name || node.tagName || node.kind,
                        feature: w.replace('CSS_DYNAMIC_VALUE: ', ''),
                        action: 'ignored',
                        message: `Dynamic CSS value — resolved at runtime`,
                    });
                }
            }
        }

        if (node.children) {
            for (const child of node.children) walk(child);
        }
    }

    walk(irRoot);

    return {
        totalElements,
        importedElements: totalElements,
        warnings,
        unsupportedCssCount,
    };
}

/**
 * Adapt an ImportIRDocument to a FigmaVendorDocument.
 * The output is suitable for the Figma plugin deserializer.
 */
export function adaptIRToFigmaVendorDoc(ir: ImportIRDocument): FigmaVendorDocument {
    const root = adaptNode(ir.root, 0);

    // Ensure SECTION has required pluginData
    if (root.type === 'SECTION') {
        root.pluginData = root.pluginData || {};
        root.pluginData['jpage'] = 'true';
        if (ir.route) {
            root.pluginData['urlRoute'] = ir.route;
        }

        // Generate and attach ImportReport
        const report = collectImportReport(ir.root);
        root.pluginData['jay-import-report'] = JSON.stringify(report);
    }

    return root;
}
