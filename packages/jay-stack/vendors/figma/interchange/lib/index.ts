// Ported from Figma API types (simplified for Node.js usage)

export interface Paint {
    type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'IMAGE' | 'VIDEO';
    visible?: boolean;
    opacity?: number;
    blendMode?: string;
    // ... extensive props for each type
    color?: { r: number; g: number; b: number }; // For SOLID
    // ...
}

export interface Effect {
    type: 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
    visible: boolean;
    radius: number;
    // ...
}

export interface LayoutMixin {
    layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    primaryAxisSizingMode: 'FIXED' | 'AUTO';
    counterAxisSizingMode: 'FIXED' | 'AUTO';

    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    itemSpacing: number;

    // Phase 1: Enhanced Layout Properties
    layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical: 'FIXED' | 'HUG' | 'FILL';
    primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
    counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';

    // Constraints
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;

    // Scrolling
    overflowDirection: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
}

export interface FigmaInterchangeDoc {
    version: string; // Schema version
    vendor: 'figma';
    exportedAt: string;
    documentName: string;

    // NEW: Page URL (e.g., "/home")
    pageUrl: string;

    // NEW: Multiple views for breakpoints and A/B testing
    // Keys: 'mobile', 'desktop', 'mobile-variant-a', etc.
    views: Record<string, InterchangeNode>;

    // NEW: Page-level shared components
    components?: InterchangeNode[];

    // NEW: Preserve constraint metadata for reconstruction
    breakpointConstraints: Record<
        string,
        {
            minWidth: number;
            maxWidth: number;
        }
    >;

    // DEPRECATED: Legacy single-root format (kept for backward compatibility)
    root?: InterchangeNode;
}

export type InterchangeNode =
    | InterchangeFrame
    | InterchangeText
    | InterchangeRectangle
    | InterchangeInstance
    | InterchangeComponent
    | InterchangeGroup
    | InterchangeVector
    | InterchangeImage
    | InterchangeEllipse
    | InterchangeInput
    | InterchangeFileUpload;
// Add more as needed

export interface BaseInterchangeNode {
    id: string;
    name: string;
    type: string; // 'FRAME', 'TEXT', etc.
    visible: boolean;

    // --- Geometry ---
    width: number;
    height: number;
    x: number;
    y: number;
    opacity?: number;
    rotation?: number;

    // --- Visuals ---
    fills: Paint[];
    strokes: Paint[];
    effects: Effect[];

    // --- Jay Data (Co-located) ---
    jayData?: JayNodeMetadata;
}

export interface InterchangeFrame extends BaseInterchangeNode, LayoutMixin {
    type: 'FRAME' | 'COMPONENT' | 'INSTANCE';
    children: InterchangeNode[];
    cornerRadius?:
        | number
        | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
    // ... auto-layout props from LayoutMixin
}

export interface InterchangeText extends BaseInterchangeNode {
    type: 'TEXT';
    characters: string;

    // Phase 1: Enhanced Text Properties
    fontFamily: string;
    fontStyle: string;
    fontWeight: number;
    fontSize: number;
    letterSpacing: number | string;
    lineHeight: number | string | { value: number; unit: string };
    textDecoration: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
    textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';

    // Color usually comes from fills, but sometimes useful here as shortcut
    // color?: string;
}

export interface InterchangeRectangle extends BaseInterchangeNode {
    type: 'RECTANGLE';
    cornerRadius?:
        | number
        | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
}

export interface InterchangeComponent extends InterchangeFrame {
    type: 'COMPONENT';
}

export interface InterchangeInstance extends InterchangeFrame {
    type: 'INSTANCE';
    componentId: string;

    // Phase 1: Enhanced Instance Properties
    variantProperties?: { [key: string]: string };
    componentSetId?: string;
}

export interface InterchangeGroup extends BaseInterchangeNode {
    type: 'GROUP';
    children: InterchangeNode[];
}

export interface InterchangeVector extends BaseInterchangeNode {
    type: 'VECTOR';
    svgContent: string; // Pre-exported SVG content from Figma
}

export interface InterchangeImage extends BaseInterchangeNode {
    type: 'IMAGE';
    imageUrl: string; // URL or data URI for the image
    cornerRadius?:
        | number
        | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
}

export interface InterchangeEllipse extends BaseInterchangeNode {
    type: 'ELLIPSE';
}

export interface InterchangeInput extends BaseInterchangeNode {
    type: 'INPUT';
    inputType?: string; // 'text', 'email', 'password', etc.
    placeholder?: string;
    value?: string;
    // Font/text styling from the text child
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    textColor?: string;
    letterSpacing?: string;
    lineHeight?: string;
    textAlign?: string;
    cornerRadius?:
        | number
        | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
}

export interface InterchangeFileUpload extends BaseInterchangeNode {
    type: 'FILE_UPLOAD';
    multiple?: boolean;
    webkitdirectory?: boolean;
    labelText?: string; // Text shown on the upload button
    // Font/text styling
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    textColor?: string;
    letterSpacing?: string;
    lineHeight?: string;
    textAlign?: string;
    cornerRadius?:
        | number
        | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
}

export interface JayNodeMetadata {
    /** Bindings to Jay Contract properties */
    bindings?: JayLayerBinding[];

    /** HTML Semantic Tag Override */
    semanticTag?: string;

    /** Directives (j-if, j-for) */
    directives?: JayDirective[];

    /** Link/Navigation information */
    link?: JayLink;

    /** Pseudo-class styles (hover, active, focus) */
    pseudoStyles?: JayPseudoStyles;

    /** Import information for Jay Components */
    componentImport?: string;

    /** Is this node an overlay/popup? */
    isOverlay?: boolean;
}

export interface JayPseudoStyles {
    hover?: { [key: string]: string }; // CSS properties for :hover
    active?: { [key: string]: string }; // CSS properties for :active
    focus?: { [key: string]: string }; // CSS properties for :focus
}

export interface JayLink {
    href: string;
    target?: '_blank' | '_self' | '_parent' | '_top';
    isOverlay?: boolean;
    overlayId?: string;
}

export interface JayLayerBinding {
    contractProperty: string; // e.g., "viewModel.title"
    targetProperty: string; // e.g., "characters", "fill"
}

export interface JayDirective {
    type: 'if' | 'for';
    expression: string;
    variable?: string; // for j-for (item)
}
