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

export interface GetProjectConfigurationMessage
    extends BaseMessage<GetProjectConfigurationResponse> {
    type: 'getProjectConfiguration';
}

export interface GetContractsMessage extends BaseMessage<GetContractsResponse> {
    type: 'getContracts';
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
    usedComponents: {
        contract: string;
        src: string;
        name: string;
        key: string;
    }[];
}

export interface ProjectComponent {
    name: string;
    filePath: string;
    contractPath?: string;
}

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

export interface ProjectConfiguration {
    name: string;
    localPath: string;
    pages: ProjectPage[];
    components: ProjectComponent[];
    installedApps: InstalledApp[];
}

export interface GetProjectConfigurationResponse extends BaseResponse {
    type: 'getProjectConfiguration';
    configuration: ProjectConfiguration;
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

export interface PageContractSchema {
    pageName: string;
    pageUrl: string; // Unique identifier for the page
    contractSchema?: ContractSchema; // Optional - page's own contract if it has a .jay-contract file
    usedComponentContracts: {
        appName: string;
        componentName: string;
    }[];
}

export interface InstalledAppPageContract {
    pageName: string;
    contractSchema: ContractSchema;
}

export interface InstalledAppComponentContract {
    componentName: string;
    contractSchema: ContractSchema;
}

export interface InstalledAppContracts {
    appName: string;
    module: string;
    pages: InstalledAppPageContract[];
    components: InstalledAppComponentContract[];
}

export interface GetContractsResponse extends BaseResponse {
    type: 'getContracts';
    pages: PageContractSchema[];
    installedAppContracts: {
        [appName: string]: InstalledAppContracts;
    };
}

// Union types for all messages and responses
export type EditorProtocolMessageTypes =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetProjectConfigurationMessage
    | GetContractsMessage;
export type EditorProtocolResponseTypes =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
    | GetProjectConfigurationResponse
    | GetContractsResponse;

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

    // Get the project configuration including pages, components, and installed apps
    getProjectConfiguration(
        params: GetProjectConfigurationMessage,
    ): Promise<GetProjectConfigurationResponse>;

    // Get all contracts (pages and installed apps)
    getContracts(params: GetContractsMessage): Promise<GetContractsResponse>;
}

// Dev server side interface for handling editor requests
export interface DevServerProtocol {
    // Handle jay-html publication requests
    onPublish(callback: EditorProtocol['publish']): void;

    // Handle image save requests
    onSaveImage(callback: EditorProtocol['saveImage']): void;

    // Handle image existence check requests
    onHasImage(callback: EditorProtocol['hasImage']): void;

    // Handle project configuration requests
    onGetProjectConfiguration(callback: EditorProtocol['getProjectConfiguration']): void;

    // Handle contracts requests
    onGetContracts(callback: EditorProtocol['getContracts']): void;
}
