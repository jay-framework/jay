import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { ImportIRDocument, ImportIRNode, ImportIRStyle } from './import-ir';

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

    // rgb(r, g, b)
    const rgbMatch = cssColor.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1], 10) / 255,
            g: parseInt(rgbMatch[2], 10) / 255,
            b: parseInt(rgbMatch[3], 10) / 255,
            a: 1,
        };
    }

    // rgba(r, g, b, a)
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

    // Fallback for unrecognized color formats
    return { r: 0.9, g: 0.9, b: 0.9, a: 1 };
}

function mapStyleToFigmaProps(style: ImportIRStyle | undefined): Partial<FigmaVendorDocument> {
    if (!style) return {};

    const props: Partial<FigmaVendorDocument> = {};

    if (style.width !== undefined) props.width = style.width;
    if (style.height !== undefined) props.height = style.height;

    if (style.layoutMode) {
        if (style.layoutMode === 'row') props.layoutMode = 'HORIZONTAL';
        else if (style.layoutMode === 'column') props.layoutMode = 'VERTICAL';
        else props.layoutMode = 'NONE';
    }
    if (style.layoutWrap) {
        props.layoutWrap = 'WRAP';
    }

    if (style.gap !== undefined) props.itemSpacing = style.gap;

    if (style.padding) {
        props.paddingTop = style.padding.top;
        props.paddingRight = style.padding.right;
        props.paddingBottom = style.padding.bottom;
        props.paddingLeft = style.padding.left;
    }

    if (style.backgroundColor) {
        const color = parseColor(style.backgroundColor);
        props.fills = [
            { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a },
        ];
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
    if (style.borderWidth !== undefined && style.borderWidth > 0) {
        props.strokeWeight = style.borderWidth;
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
            const color = parseColor(e.color);
            return {
                type: e.type,
                color: { r: color.r, g: color.g, b: color.b, a: color.a },
                offset: e.offset,
                radius: e.radius,
                spread: e.spread ?? 0,
                visible: true,
            };
        });
    }

    if (style.flexGrow !== undefined && style.flexGrow > 0) {
        props.layoutGrow = style.flexGrow;
    }

    return props;
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
            base.fontName = { family, style: fontWeightToStyle(weight) };
            if (node.style?.fontSize) base.fontSize = node.style.fontSize;
            if (weight) base.fontWeight = weight;
            if (node.style?.textColor) {
                const color = parseColor(node.style.textColor);
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
            const sizeProps = mapStyleToFigmaProps(node.style);
            if (sizeProps.width) base.width = sizeProps.width;
            if (sizeProps.height) base.height = sizeProps.height;
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

    // CSS flexbox default: children stretch on cross-axis (align-items: stretch)
    if (base.layoutMode && base.layoutMode !== 'NONE' && base.children) {
        const explicitAlign =
            base.counterAxisAlignItems === 'CENTER' || base.counterAxisAlignItems === 'MAX';
        if (!explicitAlign) {
            for (const child of base.children) {
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

    // Grid→WRAP: set children to fixed column width from grid-template-columns
    if (base.layoutWrap === 'WRAP' && node.style?.gridColumnWidths && base.children) {
        const colWidth = node.style.gridColumnWidths[0];
        if (colWidth && colWidth > 0) {
            for (const child of base.children) {
                child.width = colWidth;
                child.layoutSizingHorizontal = 'FIXED';
            }
        }
    }

    return base;
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
    }

    return root;
}
