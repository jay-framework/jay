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

export type ImportIREffect = {
    type: 'DROP_SHADOW';
    color: string;
    offset: { x: number; y: number };
    radius: number;
    spread?: number;
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
    layoutMode?: ImportIRLayoutMode;
    layoutWrap?: boolean;
    gap?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    alignItems?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    justifyContent?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
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
    textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH' | 'NONE';
    textCase?: 'UPPER' | 'LOWER' | 'TITLE' | 'ORIGINAL';
    textTruncation?: 'ENDING';
    clipsContent?: boolean;
    flexGrow?: number;
    isAbsolute?: boolean;
    gridColumnWidths?: number[];
    gridRowHeights?: number[];
    rowGap?: number;
    effects?: ImportIREffect[];
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
        alt?: string;
        objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    };
    htmlAttributes?: Record<string, string>;
    bindings?: ImportIRBinding[];
    svgData?: string;
    warnings?: string[];
    children?: ImportIRNode[];
    // Variant-related fields for COMPONENT_SET / COMPONENT / INSTANCE
    variantProperties?: Record<string, string>; // For COMPONENT nodes
    componentPropertyDefinitions?: Record<string, { type: 'VARIANT'; variantOptions: string[] }>; // For COMPONENT_SET
    mainComponentId?: string; // For INSTANCE nodes
};

export type ImportIRDocument = {
    version: 'import-ir/v0';
    pageName: string;
    route?: string;
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
