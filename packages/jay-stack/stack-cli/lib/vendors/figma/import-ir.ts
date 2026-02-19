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

export type ImportIRLayoutMode = 'none' | 'row' | 'column';

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
    gap?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    alignItems?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    justifyContent?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    opacity?: number;
    textColor?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;
    letterSpacing?: number;
};

export type ImportIRNode = {
    id: string;
    sourcePath: string;
    kind: ImportIRNodeKind;
    name?: string;
    tagName?: string;
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
    bindings?: ImportIRBinding[];
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
