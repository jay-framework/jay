/**
 * Figma Vendor Document Type
 *
 * A JSON-compatible representation of Figma nodes that can be safely
 * transmitted over the protocol.
 *
 * @example
 * ```typescript
 * import { FigmaVendorDocument } from '@jay-framework/editor-protocol';
 *
 * const sectionNode = figma.currentPage.selection[0];
 * const vendorDoc: FigmaVendorDocument = serializeNode(sectionNode);
 *
 * await editorProtocol.export({
 *   vendorId: 'figma',
 *   pageUrl: '/home',
 *   vendorDoc
 * });
 * ```
 */
export type FigmaVendorDocument = {
    id: string;
    name: string;
    type: string;
    visible?: boolean;
    locked?: boolean;
    // parentId removed — Design Log #93 (not used by forward converter or deserializer)
    children?: FigmaVendorDocument[];

    // Layout
    x?: number;
    y?: number;
    width?: number;
    height?: number;

    // Plugin data - Jay-specific metadata
    pluginData?: {
        [key: string]: string;
    };

    // Component properties (for components with variants)
    componentPropertyDefinitions?: {
        [propertyName: string]: {
            type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
            variantOptions?: string[]; // Array of possible values for VARIANT type
            defaultValue?: string | boolean;
        };
    };

    // Component set reference (if this is a variant component or instance)
    componentSetId?: string;
    componentSetName?: string;

    // Instance-specific properties
    mainComponentId?: string; // Reference to the main component
    mainComponentName?: string;
    componentProperties?: any; // Instance overrides for component properties

    // Variant properties (actual values for this specific variant)
    variantProperties?: {
        [propertyName: string]: string;
    };

    // All variants (for component sets - array of all variant components)
    variants?: FigmaVendorDocument[];

    // Text node properties
    characters?: string;
    fontName?: { family: string; style: string } | 'MIXED';
    fontSize?: number | 'MIXED';
    fontWeight?: number | 'MIXED';
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
    letterSpacing?: { value: number; unit: 'PIXELS' | 'PERCENT' };
    lineHeight?: { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' } | { unit: 'AUTO' };
    textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
    textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
    textTruncation?: 'DISABLED' | 'ENDING';
    maxLines?: number;
    maxWidth?: number;
    textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
    hasMissingFont?: boolean;
    hyperlinks?: Array<{
        start: number;
        end: number;
        url: string;
    }>;

    // Frame properties
    fills?: any[];
    strokes?: any[];
    effects?: any[];
    cornerRadius?: number | 'MIXED';
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomLeftRadius?: number;
    bottomRightRadius?: number;
    strokeWeight?: number;
    strokeTopWeight?: number;
    strokeBottomWeight?: number;
    strokeLeftWeight?: number;
    strokeRightWeight?: number;
    dashPattern?: number[];
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
    itemSpacing?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    layoutPositioning?: 'AUTO' | 'ABSOLUTE';
    layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
    layoutGrow?: number;
    layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    layoutWrap?: 'NO_WRAP' | 'WRAP';
    clipsContent?: boolean;
    overflowDirection?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
    scrollBehavior?: 'SCROLLS' | 'FIXED';
    // parent* properties removed — Design Log #93.
    // Forward converter now derives parent context from tree walk.
    // Legacy JSON may still have these fields (allowed via [key: string]: any).

    // Common properties
    opacity?: number;
    rotation?: number;

    // Vector properties
    vectorPaths?: Array<{
        windingRule: 'NONZERO' | 'EVENODD';
        data: string;
    }>;
    fillGeometry?: Array<{
        windingRule: 'NONZERO' | 'EVENODD';
        data: string;
    }>;
    strokeGeometry?: Array<{
        windingRule: 'NONZERO' | 'EVENODD';
        data: string;
    }>;

    // Allow additional properties for extensibility
    [key: string]: any;
};
