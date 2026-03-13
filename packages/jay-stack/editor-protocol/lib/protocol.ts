// Protocol-specific contract types optimized for external consumers
// These mirror compiler types but use simple, serializable representations

export interface ContractTag {
    tag: string; // tag ID
    type: string | string[]; // tag type(s) - simplified from enum to strings
    dataType?: string; // string representation of JayType (e.g. "string", "enum (active | inactive)")
    elementType?: string; // string representation of element types
    required?: boolean;
    repeated?: boolean;
    tags?: ContractTag[]; // for sub-contracts
    link?: string; // for linked sub-contracts
    trackBy?: string; // for repeated sub-contracts
    async?: boolean;
    phase?: string; // rendering phase as string
}

export interface Contract {
    name: string;
    tags: ContractTag[];
}

// Base message type with discriminator and generic response type
export interface BaseMessage<TResponse extends BaseResponse = BaseResponse> {
    type: string;
}

// Base response type with discriminator
export interface BaseResponse {
    type: string;
    success: boolean;
    error?: string;
}

// Message types with discriminators and specific response types
export interface PublishMessage extends BaseMessage<PublishResponse> {
    type: 'publish';
    pages?: {
        route: string;
        jayHtml: string;
        name: string;
        contract?: string; // Optional contract content for headless pages
    }[];
    components?: {
        jayHtml: string;
        name: string;
        contract?: string; // Optional contract content for headless components
    }[];
}

export type PublishPage = PublishMessage['pages'][number];
export type PublishComponent = PublishMessage['components'][number];

export interface SaveImageMessage extends BaseMessage<SaveImageResponse> {
    type: 'saveImage';
    imageId: string;
    imageData: string; // base64 encoded image data
}

export interface HasImageMessage extends BaseMessage<HasImageResponse> {
    type: 'hasImage';
    imageId: string;
}

export interface GetImageDataMessage extends BaseMessage<GetImageDataResponse> {
    type: 'getImageData';
    imageId: string;
}

export interface GetProjectInfoMessage extends BaseMessage<GetProjectInfoResponse> {
    type: 'getProjectInfo';
}

export interface ExportMessage<TVendorDoc> extends BaseMessage<ExportResponse> {
    type: 'export';
    vendorId: string;
    pageUrl: string;
    vendorDoc: TVendorDoc;
}

export interface ImportMessage<TVendorDoc> extends BaseMessage<ImportResponse<TVendorDoc>> {
    type: 'import';
    vendorId: string;
    pageUrl: string;
}

// Response types with discriminators
export interface PublishResponse extends BaseResponse {
    type: 'publish';
    status: {
        success: boolean;
        filePath?: string;
        contractPath?: string; // Path to published contract file (if applicable)
        error?: string;
    }[];
}

export type PublishStatus = PublishResponse['status'][number];

export interface SaveImageResponse extends BaseResponse {
    type: 'saveImage';
    success: boolean;
    imageUrl?: string;
    error?: string;
}

export interface HasImageResponse extends BaseResponse {
    type: 'hasImage';
    exists: boolean;
    imageUrl?: string;
}

export interface GetImageDataResponse extends BaseResponse {
    type: 'getImageData';
    imageData?: string;
    mimeType?: string;
}

export interface ProjectPage {
    name: string;
    url: string;
    filePath: string;
    contract?: Contract; // Page's own contract if it has a .jay-contract file
    usedComponents: {
        appName: string;
        componentName: string;
        key: string;
    }[];
}

export interface ProjectComponent {
    name: string;
    filePath: string;
    contractPath?: string;
}

// Plugin types - re-exported from compiler-shared for single source of truth
import type {
    PluginManifest as PluginManifestBase,
    DynamicContractConfig,
} from '@jay-framework/compiler-shared';

// Re-export with explicit interface to avoid tsup/rollup issues
export interface PluginManifest extends PluginManifestBase {}
export interface DynamicContractDef extends DynamicContractConfig {}

// Static contract definition (subset of PluginManifest.contracts entry)
export interface StaticContractDef {
    name: string; // Contract name (kebab-case)
    contract: string; // Path to contract file
    component: string; // Exported member name from the module (e.g., "moodTracker")
    description?: string; // Optional description
}
export interface Plugin {
    name: string; // Plugin name (kebab-case) for the plugin attribute
    contracts: Contract[]; // Array of available contracts
}

export interface ProjectInfo {
    name: string;
    localPath: string;
    pages: ProjectPage[];
    components: ProjectComponent[];
    plugins: Plugin[];
}

export interface GetProjectInfoResponse extends BaseResponse {
    type: 'getProjectInfo';
    info: ProjectInfo;
}

export interface ExportResponse extends BaseResponse {
    type: 'export';
    vendorSourcePath?: string;
    jayHtmlPath?: string;
    contractPath?: string;
    warnings?: string[];
    /** True when the jay-html file on disk changed since last import */
    diskDiverged?: boolean;
}

export interface ImportResponse<TVendorDoc> extends BaseResponse {
    type: 'import';
    vendorDoc?: TVendorDoc;
    source?: 'jay-html-reconstructed';
    warnings?: string[];
    stats?: {
        nodes: number;
        bindings: number;
        variantExpressions: number;
    };
    imageManifest?: Array<{ nodeId: string; imageId: string; scaleMode?: string }>;
}

// ─── Iterative Sync Types (v1) ─────────────────────────────────────

export type MergeConfidence = 'high' | 'medium' | 'low';

export type MergeDecision = 'applyIncoming' | 'preserveDesigner' | 'needsDecision' | 'skip';

export type ConflictSeverity = 'info' | 'warning' | 'action_required';

export type ConflictAction = 'keepMine' | 'applyIncoming' | 'rebind';

export type PropertyClass = 'visual' | 'layout' | 'semantic';

export interface SyncStateV1 {
    schemaVersion: 1;
    pageUrl: string;
    sectionSyncId: string;
    baselineImportHash: string;
    baselineImportedAt: string;
    lastMergeSessionId?: string;
    lastMergeAppliedAt?: string;
    unresolvedConflictCount: number;
}

export interface BaselineNodeSnapshot {
    nodeKey: string;
    properties: Record<string, unknown>;
}

export interface SyncBaselineV1 {
    schemaVersion: 1;
    pageUrl: string;
    nodes: BaselineNodeSnapshot[];
}

export interface MergeOperation {
    nodeKey: string;
    property: string;
    propertyClass: PropertyClass;
    decision: MergeDecision;
    confidence: MergeConfidence;
    rationale: string;
    baselineValue?: unknown;
    designerValue?: unknown;
    incomingValue?: unknown;
}

export interface StructuralOperation {
    type: 'add' | 'remove' | 'reorder';
    nodeKey: string;
    confidence: MergeConfidence;
    decision: MergeDecision;
    rationale: string;
    hasDesignerOverride: boolean;
}

export interface ConflictItem {
    nodeKey: string;
    nodeName: string;
    property: string;
    propertyClass: PropertyClass;
    severity: ConflictSeverity;
    reason: string;
    designerValue?: unknown;
    incomingValue?: unknown;
    suggestedActions: ConflictAction[];
    resolved?: boolean;
    resolution?: ConflictAction;
}

export interface ImportReportV2 {
    schemaVersion: 2;
    sessionId: string;
    timestamp: string;
    summary: {
        added: number;
        updated: number;
        removed: number;
        preserved: number;
        conflicted: number;
        skipped: number;
    };
    applied: Array<{
        nodeKey: string;
        property: string;
        rationale: string;
    }>;
    preservedOverrides: Array<{
        nodeKey: string;
        property: string;
        reason: string;
    }>;
    conflicts: ConflictItem[];
    warnings: Array<{
        nodeKey: string;
        message: string;
        confidence: MergeConfidence;
    }>;
    optimizations: Array<{
        type: string;
        nodeKey: string;
        detail: string;
    }>;
    metrics: {
        autoMergeRatio: number;
        conflictCount: number;
        matchConfidenceDistribution: Record<MergeConfidence, number>;
    };
}

export interface MergePreviewRequest<TVendorDoc> extends BaseMessage<MergePreviewResponse> {
    type: 'mergePreview';
    vendorId: string;
    pageUrl: string;
    existingSectionData?: TVendorDoc;
}

export interface MergePreviewResponse extends BaseResponse {
    type: 'mergePreview';
    report?: ImportReportV2;
}

export interface MergeApplyRequest<TVendorDoc> extends BaseMessage<MergeApplyResponse<TVendorDoc>> {
    type: 'mergeApply';
    vendorId: string;
    pageUrl: string;
    existingSectionData?: TVendorDoc;
    conflictResolutions?: Array<{
        nodeKey: string;
        property: string;
        action: ConflictAction;
        rebindTarget?: string;
    }>;
}

export interface MergeApplyResponse<TVendorDoc> extends BaseResponse {
    type: 'mergeApply';
    vendorDoc?: TVendorDoc;
    report?: ImportReportV2;
    syncState?: SyncStateV1;
}

export interface CaptureSnapshotRequest extends BaseMessage<CaptureSnapshotResponse> {
    type: 'captureSnapshot';
    sectionSyncId: string;
}

export interface CaptureSnapshotResponse extends BaseResponse {
    type: 'captureSnapshot';
    snapshotData?: string;
}

export interface RestoreSnapshotRequest extends BaseMessage<RestoreSnapshotResponse> {
    type: 'restoreSnapshot';
    sectionSyncId: string;
    snapshotData: string;
}

export interface RestoreSnapshotResponse extends BaseResponse {
    type: 'restoreSnapshot';
}

// Union types for all messages and responses
export type EditorProtocolMessageTypes<TVendorDoc> =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetImageDataMessage
    | GetProjectInfoMessage
    | ExportMessage<TVendorDoc>
    | ImportMessage<TVendorDoc>;

export type EditorProtocolResponseTypes<TVendorDoc> =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
    | GetImageDataResponse
    | GetProjectInfoResponse
    | ExportResponse
    | ImportResponse<TVendorDoc>;

export interface ProtocolMessage<TVendorDoc> {
    id: string;
    timestamp: number;
    payload: EditorProtocolMessageTypes<TVendorDoc>;
}

export interface ProtocolResponse<TVendorDoc> {
    id: string;
    timestamp: number;
    payload: EditorProtocolResponseTypes<TVendorDoc>;
}

// Editor side interface for communicating with dev server
export interface EditorProtocol {
    // Publish jay-html files to the dev server
    publish(params: PublishMessage): Promise<PublishResponse>;

    // Save an image to the local dev server
    saveImage(params: SaveImageMessage): Promise<SaveImageResponse>;

    // Check if a previously saved image exists
    hasImage(params: HasImageMessage): Promise<HasImageResponse>;

    // Get image bytes from the dev server (for import image hydration)
    getImageData(params: GetImageDataMessage): Promise<GetImageDataResponse>;

    // Get comprehensive project information including configuration and contracts
    getProjectInfo(params: GetProjectInfoMessage): Promise<GetProjectInfoResponse>;

    // Export design from vendor (e.g., Figma) to Jay
    export<TVendorDoc>(params: ExportMessage<TVendorDoc>): Promise<ExportResponse>;

    // Import design from Jay back to vendor
    import<TVendorDoc>(params: ImportMessage<TVendorDoc>): Promise<ImportResponse<TVendorDoc>>;
}

// Dev server side interface for handling editor requests
export interface DevServerProtocol {
    // Handle jay-html publication requests
    onPublish(callback: EditorProtocol['publish']): void;

    // Handle image save requests
    onSaveImage(callback: EditorProtocol['saveImage']): void;

    // Handle image existence check requests
    onHasImage(callback: EditorProtocol['hasImage']): void;

    // Handle project info requests
    onGetProjectInfo(callback: EditorProtocol['getProjectInfo']): void;

    // Handle vendor export requests
    onExport(callback: EditorProtocol['export']): void;

    // Handle vendor import requests
    onImport(callback: EditorProtocol['import']): void;
}
