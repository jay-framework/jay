import { PageContractPath } from './pageContractPath';
import type { ContractTag, FigmaVendorDocument } from '@jay-framework/editor-protocol';

/**
 * Type definition for layer bindings stored in Figma plugin data
 */
export type LayerBinding = {
    pageContractPath: PageContractPath;
    jayPageSectionId: string;
    tagPath: string[];
    attribute?: string;
    property?: string;
};

/**
 * Analysis result for node bindings
 */
export interface BindingAnalysis {
    // Type of binding
    type:
        | 'none'
        | 'dynamic-content'
        | 'interactive'
        | 'attribute'
        | 'property-variant'
        | 'dual'
        | 'repeater';

    // For dynamic content
    dynamicContentPath?: string;
    dynamicContentTag?: ContractTag;

    // For interactive refs
    refPath?: string;

    // For dual type (both data and interactive)
    dualPath?: string;

    // For attributes (can have multiple)
    attributes: Map<string, string>; // attribute name -> tag path

    // For property variants (can have multiple)
    propertyBindings: Array<{
        property: string;
        tagPath: string;
        contractTag: ContractTag;
    }>;

    // For property variants that are also interactive (type: [variant, interactive])
    interactiveVariantPath?: string;
    // For repeaters
    isRepeater: boolean;
    repeaterPath?: string;
    trackByKey?: string;
    repeaterTag?: ContractTag;
}

/**
 * Conversion context passed through the recursion
 */
export interface ExportDiagnostic {
    type: 'blocked-override' | 'missing-baseline';
    nodeId: string;
    nodeName?: string;
    className?: string;
    property?: string;
    message: string;
}

export interface ConversionContext {
    repeaterPathStack: string[][];
    indentLevel: number;
    fontFamilies: Set<string>;
    projectPage: any;
    plugins: any[];
    componentSetIndex?: Map<string, FigmaVendorDocument>;
    diagnostics?: ExportDiagnostic[];
}
