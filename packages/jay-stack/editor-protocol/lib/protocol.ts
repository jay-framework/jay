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
}

// Union types for all messages and responses
export type EditorProtocolMessageTypes<TVendorDoc> =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetProjectInfoMessage
    | ExportMessage<TVendorDoc>
    | ImportMessage<TVendorDoc>;

export type EditorProtocolResponseTypes<TVendorDoc> =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
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
