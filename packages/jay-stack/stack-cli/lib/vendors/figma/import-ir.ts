import type { LayerBinding } from './types';
import type { PageContractPath } from './pageContractPath';
import type { Contract } from '@jay-framework/editor-protocol';
import type { JayHeadlessImports } from '@jay-framework/compiler-jay-html';

export type ImportIRNodeKind =
    | 'SECTION'
    | 'FRAME'
    | 'TEXT'
    | 'IMAGE'
    | 'VECTOR_PLACEHOLDER'
    | 'INSTANCE'
    | 'COMPONENT'
    | 'COMPONENT_SET';

export type ImportIRLayoutMode = 'none' | 'row' | 'column' | 'grid';

export interface GridColumnDef {
    type: 'FIXED' | 'FLEX';
    value: number;
}

export interface VariantExpressionRef {
    alias: string;
    tagPath: string[];
    pageContractPath: PageContractPath;
    boundProperty?: string;
}

export interface VariantExpressionBinding {
    id: string;
    expression: string;
    references: VariantExpressionRef[];
    kind: 'variant-expression';
}

export interface PseudoVariantBinding {
    pseudo: string;
    baseVariant?: string;
    pseudoVariant?: string;
}

export type ImportIRBinding =
    | { kind: 'layer'; binding: LayerBinding }
    | { kind: 'variant'; binding: VariantExpressionBinding | PseudoVariantBinding };

export type ImportIRImageRef = {
    importImageId?: string;
    sourceUrl: string;
    kind: 'img-src' | 'background-image';
    scaleMode: 'FILL' | 'FIT' | 'TILE';
};

export type ImportIRFill =
    | { type: 'SOLID'; color: string }
    | {
          type: 'GRADIENT_LINEAR';
          angle: number;
          stops: Array<{ position: number; color: string }>;
      };

export type ImportIREffect =
    | {
          type: 'DROP_SHADOW' | 'INNER_SHADOW';
          color: string;
          offset: { x: number; y: number };
          radius: number;
          spread?: number;
      }
    | {
          type: 'LAYER_BLUR' | 'BACKGROUND_BLUR';
          radius: number;
      };

export type ImportIRStyle = {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    x?: number;
    y?: number;
    display?: string;
    layoutMode?: ImportIRLayoutMode;
    layoutWrap?: boolean;
    gap?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    alignItems?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    justifyContent?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    fills?: ImportIRFill[];
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderTopWidth?: number;
    borderRightWidth?: number;
    borderBottomWidth?: number;
    borderLeftWidth?: number;
    borderRadius?: number;
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomLeftRadius?: number;
    bottomRightRadius?: number;
    opacity?: number;
    textColor?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;
    letterSpacing?: number;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH' | 'NONE';
    textCase?: 'UPPER' | 'LOWER' | 'TITLE' | 'ORIGINAL';
    textTruncation?: 'ENDING';
    clipsContent?: boolean;
    flexGrow?: number;
    isAbsolute?: boolean;
    gridColumnWidths?: number[];
    gridRowHeights?: number[];
    gridColumns?: GridColumnDef[];
    gridRows?: GridColumnDef[];
    gridColumnSpan?: number;
    gridRowSpan?: number;
    rowGap?: number;
    effects?: ImportIREffect[];
    backgroundImageRef?: ImportIRImageRef;
};

export type ImportIRNode = {
    id: string;
    sourcePath: string;
    kind: ImportIRNodeKind;
    name?: string;
    tagName?: string;
    className?: string;
    visible?: boolean;
    style?: ImportIRStyle;
    text?: {
        characters: string;
        segments?: Array<{ start: number; end: number; style: Partial<ImportIRStyle> }>;
    };
    image?: {
        src?: string;
        resolvedSrc?: string;
        alt?: string;
        objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
        imageRef?: ImportIRImageRef;
    };
    htmlAttributes?: Record<string, string>;
    selectOptions?: Array<{ value: string; text: string; selected?: boolean }>;
    unsupportedCss?: Record<string, string>;
    bindings?: ImportIRBinding[];
    svgData?: string;
    warnings?: string[];
    children?: ImportIRNode[];
    demoItems?: Array<{
        textOverrides: Record<string, string>;
        imageOverrides: Record<string, string>;
    }>;
    // Variant-related fields for COMPONENT_SET / COMPONENT / INSTANCE
    variantProperties?: Record<string, string>; // For COMPONENT nodes
    componentPropertyDefinitions?: Record<string, { type: 'VARIANT'; variantOptions: string[] }>; // For COMPONENT_SET
    mainComponentId?: string; // For INSTANCE nodes
    preferHiddenDefault?: boolean; // INSTANCE should default to _hidden_ variant

    /** Class-only safe baseline for class-based diff. Built from browser extraction, not rendered state. */
    classOnlyBaselineInput?: Record<string, string>;
};

export type ImportIRDocument = {
    version: 'import-ir/v0';
    pageName: string;
    route?: string;
    pageBackgroundColor?: string;
    source: {
        kind: 'jay-html';
        filePath: string;
        contentHash: string;
    };
    parser: {
        baseElementName: string;
        namespaces?: Record<string, string>;
        linkedCssFiles?: string[];
    };
    contracts: {
        pageContract?: Contract;
        headlessImports?: JayHeadlessImports[];
    };
    root: ImportIRNode;
    warnings: string[];
};
