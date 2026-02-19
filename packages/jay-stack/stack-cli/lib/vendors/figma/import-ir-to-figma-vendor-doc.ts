import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { ImportIRDocument, ImportIRNode, ImportIRStyle } from './import-ir';

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
    if (style.opacity !== undefined) props.opacity = style.opacity;
    if (style.borderWidth !== undefined) props.strokeWeight = style.borderWidth;
    if (style.borderColor) {
        const color = parseColor(style.borderColor);
        props.strokes = [
            { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a },
        ];
    }

    if (style.justifyContent) props.primaryAxisAlignItems = style.justifyContent;
    if (style.alignItems) {
        // Figma uses BASELINE instead of STRETCH for counterAxis; STRETCH is handled via layoutAlign on children
        const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'> = {
            MIN: 'MIN',
            CENTER: 'CENTER',
            MAX: 'MAX',
            STRETCH: 'MIN',
        };
        props.counterAxisAlignItems = alignMap[style.alignItems] ?? 'MIN';
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
            break;
        }
        case 'TEXT': {
            base.type = 'TEXT';
            base.textAutoResize = 'WIDTH_AND_HEIGHT';
            if (node.text) {
                base.characters = node.text.characters;
            }
            if (node.style?.fontFamily) {
                base.fontName = { family: node.style.fontFamily, style: 'Regular' };
            }
            if (node.style?.fontSize) base.fontSize = node.style.fontSize;
            if (node.style?.fontWeight) base.fontWeight = node.style.fontWeight;
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
            const sizeProps = mapStyleToFigmaProps(node.style);
            if (sizeProps.width) base.width = sizeProps.width;
            if (sizeProps.height) base.height = sizeProps.height;
            break;
        }
        case 'IMAGE': {
            base.type = 'RECTANGLE';
            base.pluginData = base.pluginData || {};
            base.pluginData['semanticHtml'] = 'img';
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
            break;
        }
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
