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
}

export interface FigmaInterchangeDoc {
    version: string; // Schema version
    vendor: 'figma';
    exportedAt: string;
    documentName: string;
    root: InterchangeNode; // Top-level Frame/Page
}

export type InterchangeNode = 
  | InterchangeFrame
  | InterchangeText
  | InterchangeRectangle
  | InterchangeInstance
  | InterchangeComponent
  // Add more as needed
  ;

export interface BaseInterchangeNode {
    id: string;
    name: string;
    type: string; // 'FRAME', 'TEXT', etc.
    visible: boolean;

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
    // ... auto-layout props from LayoutMixin
}

export interface InterchangeText extends BaseInterchangeNode {
    type: 'TEXT';
    characters: string;
    // ... font props
}

export interface InterchangeRectangle extends BaseInterchangeNode {
    type: 'RECTANGLE';
}

export interface InterchangeComponent extends InterchangeFrame {
    type: 'COMPONENT';
}

export interface InterchangeInstance extends InterchangeFrame {
    type: 'INSTANCE';
    componentId: string;
}

export interface JayNodeMetadata {
    /** Bindings to Jay Contract properties */
    bindings?: JayLayerBinding[];

    /** HTML Semantic Tag Override */
    semanticTag?: string;

    /** Directives (j-if, j-for) */
    directives?: JayDirective[];
}

export interface JayLayerBinding {
    contractProperty: string; // e.g., "viewModel.title"
    targetProperty: string;   // e.g., "characters", "fill"
}

export interface JayDirective {
    type: 'if' | 'for';
    expression: string;
    variable?: string; // for j-for (item)
}

