import { PageContractPath } from './pageContractPath';
import type {
    ContractTag,
    FigmaVendorDocument,
    SyncStateV1,
    SyncBaselineV1,
} from '@jay-framework/editor-protocol';

// ─── Sync Metadata PluginData Keys ────────────────────────────────

export const SYNC_STATE_KEY = 'jay-sync-state-v1';
export const SYNC_BASELINE_KEY = 'jay-sync-baseline-v1';
export const SYNC_ROLLBACK_KEY = 'jay-sync-rollback-v1';

export const LEGACY_IMPORT_REPORT_KEY = 'jay-import-report';
export const LEGACY_IMPORT_HASH_KEY = 'jay-import-content-hash';
export const LEGACY_IMPORT_TIMESTAMP_KEY = 'jay-import-timestamp';

// ─── Sync Metadata Serialization ──────────────────────────────────

export function parseSyncState(raw: string | undefined): SyncStateV1 | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.schemaVersion !== 1 || !parsed?.pageUrl || !parsed?.sectionSyncId) {
            return null;
        }
        return parsed as SyncStateV1;
    } catch {
        return null;
    }
}

export function serializeSyncState(state: SyncStateV1): string {
    return JSON.stringify(state);
}

export function parseSyncBaseline(raw: string | undefined): SyncBaselineV1 | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.schemaVersion !== 1 || !parsed?.pageUrl || !Array.isArray(parsed?.nodes)) {
            return null;
        }
        return parsed as SyncBaselineV1;
    } catch {
        return null;
    }
}

export function serializeSyncBaseline(baseline: SyncBaselineV1): string {
    return JSON.stringify(baseline);
}

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
