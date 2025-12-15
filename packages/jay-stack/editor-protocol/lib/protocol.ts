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
    name: string;              // Contract name (kebab-case)
    contract: string;          // Path to contract file
    component: string;         // Path to component implementation
    description?: string;      // Optional description
}

export interface DynamicContractDef {
    prefix: string;            // Namespace prefix (e.g., "cms")
    component: string;         // Shared component for all dynamic contracts
    generator: string;         // Path to generator file
}

export interface PluginManifest {
    name: string;              // Plugin name (kebab-case)
    module?: string;           // NPM module name (optional for local plugins)
    contracts?: StaticContractDef[];
    dynamic_contracts?: DynamicContractDef;
}

export interface Plugin {
    name: string;
    module?: string;
    location: 'npm' | 'local';  // Where the plugin is installed
    manifestPath: string;       // Path to plugin.yaml
    contracts: Array<{
        name: string;           // Contract name (with prefix for dynamic)
        contractPath: string;   // Path to contract file
        componentPath: string;  // Path to component
        isDynamic: boolean;     // Whether from dynamic_contracts
        description?: string;
    }>;
}

// Legacy type for backward compatibility
export interface InstalledApp {
    name: string;
    module: string;
    pages: {
        name: string;
        headless_components: {
            name: string;
            key: string;
            contract: string;
            slugs?: string[];
        }[];
    }[];
    components: {
        name: string;
        headless_components: {
            name: string;
            key: string;
            contract: string;
        }[];
    }[];
    config_map?: {
        display_name: string;
        key: string;
    }[];
}

export interface ProjectInfo {
    name: string;
    localPath: string;
    pages: ProjectPage[];
    components: ProjectComponent[];
    plugins: Plugin[];          // New plugin system
    installedApps: InstalledApp[];  // Legacy - for backward compatibility
    installedAppContracts: {
        [appName: string]: InstalledAppContracts;
    };
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

export interface InstalledAppContracts {
    appName: string;
    module: string;
    pages: Array<{
        pageName: string;
        contractSchema: ContractSchema;
    }>;
    components: Array<{
        componentName: string;
        contractSchema: ContractSchema;
    }>;
}

// Union types for all messages and responses
export type EditorProtocolMessageTypes =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetProjectInfoMessage;
export type EditorProtocolResponseTypes =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
    | GetProjectInfoResponse;

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
}
