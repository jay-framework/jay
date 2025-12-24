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

// --- New Design Sync Messages ---

export interface ExportDesignMessage extends BaseMessage<ExportDesignResponse> {
    type: 'exportDesign';
    vendorId: string;
    pageUrl: string;
    data: any; // Vendor-specific JSON (e.g., FigmaInterchangeDoc)
}

export interface ImportDesignMessage extends BaseMessage<ImportDesignResponse> {
    type: 'importDesign';
    vendorId: string;
    pageUrl?: string; // Optional: undefined = list all pages
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

export interface ExportDesignResponse extends BaseResponse {
    type: 'exportDesign';
    path?: string;
}

export interface ImportDesignResponse extends BaseResponse {
    type: 'importDesign';
    data?: { pageUrls: string[] }; // List of available page URLs (single page will have 1 URL)
}

export interface ProjectPage {
    name: string;
    url: string;
    filePath: string;
    contractSchema?: ContractSchema; // Page's own contract if it has a .jay-contract file
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

// Plugin types (replaces InstalledApp)
export interface StaticContractDef {
    name: string; // Contract name (kebab-case)
    contract: string; // Path to contract file
    component: string; // Exported member name from the module (e.g., "moodTracker")
    description?: string; // Optional description
}

export interface DynamicContractDef {
    prefix: string; // Namespace prefix (e.g., "cms")
    component: string; // Shared component for all dynamic contracts
    generator: string; // Path to generator file
}

// Page definition in plugin manifest
export interface PluginPageDef {
    name: string; // Page name (e.g., "product-page")
    contract: string; // Path to contract file
    component: string; // Exported member name from the module
    slugs?: string[]; // Dynamic route parameters (e.g., ["productId", "categoryId"])
    description?: string; // Optional description
}

// Component definition in plugin manifest  
export interface PluginComponentDef {
    name: string; // Component name (e.g., "product-card")
    contract: string; // Path to contract file
    component: string; // Exported member name from the module
    description?: string; // Optional description
}

export interface PluginManifest {
    name: string; // Plugin name (kebab-case)
    module?: string; // NPM module name (optional for local plugins)
    
    // Legacy contracts (still supported)
    contracts?: StaticContractDef[];
    
    // New structured approach
    pages?: PluginPageDef[];
    components?: PluginComponentDef[];
    
    dynamic_contracts?: DynamicContractDef;
}

export interface Plugin {
    manifest: PluginManifest;
    location: {
        type: 'local' | 'npm';
        path?: string; // For local plugins (src/plugins/my-plugin)
        module?: string; // For npm plugins (@wix/stores)
    };
}

// InstalledApp interface removed - no longer needed without backward compatibility

export interface ProjectInfo {
    name: string;
    localPath: string;
    pages: ProjectPage[];
    components: ProjectComponent[];
    plugins: Plugin[];
    pluginContracts: {
        [pluginName: string]: PluginContractsByType;
    };
}

// Plugin contracts organized by type (pages vs components)
export interface PluginContractsByType {
    pages: PluginPageContract[];
    components: PluginComponentContract[];
}

// Page contract information from a plugin
export interface PluginPageContract {
    contractName: string;
    contractSchema: ContractSchema;
    pluginName: string;
    componentName: string; // The exported component name from the plugin
    pageName: string; // Display name of the page
    slugs?: string[]; // Dynamic route parameters
}

// Component contract information from a plugin
export interface PluginComponentContract {
    contractName: string;
    contractSchema: ContractSchema;
    pluginName: string;
    componentName: string; // The exported component name from the plugin
}

export interface GetProjectInfoResponse extends BaseResponse {
    type: 'getProjectInfo';
    info: ProjectInfo;
}

export interface ContractTag {
    tag: string; // tag ID
    type: string | string[]; // tag type(s)
    dataType?: string;
    elementType?: string;
    required?: boolean;
    repeated?: boolean;
    tags?: ContractTag[]; // for sub-contracts
    link?: string; // for linked sub-contracts
}

export interface ContractSchema {
    name: string;
    tags: ContractTag[];
}


// Union types for all messages and responses
export type EditorProtocolMessageTypes =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetProjectInfoMessage
    | ExportDesignMessage
    | ImportDesignMessage;

export type EditorProtocolResponseTypes =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
    | GetProjectInfoResponse
    | ExportDesignResponse
    | ImportDesignResponse;

export interface ProtocolMessage {
    id: string;
    timestamp: number;
    payload: EditorProtocolMessageTypes;
}
export interface ProtocolResponse {
    id: string;
    timestamp: number;
    payload: EditorProtocolResponseTypes;
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

    // Export a design to the dev server (Source of Truth)
    exportDesign(params: ExportDesignMessage): Promise<ExportDesignResponse>;

    // Import a design from the dev server (Source of Truth)
    importDesign(params: ImportDesignMessage): Promise<ImportDesignResponse>;
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

    // Handle design export requests
    onExportDesign(callback: EditorProtocol['exportDesign']): void;

    // Handle design import requests
    onImportDesign(callback: EditorProtocol['importDesign']): void;
}
