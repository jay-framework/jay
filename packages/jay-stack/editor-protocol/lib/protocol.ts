// Import for internal use and re-export for external consumers
import type { Contract } from '@jay-framework/compiler-jay-html';

// Re-export contract types from compiler-jay-html as the single source of truth
export type { ContractTag, Contract } from '@jay-framework/compiler-jay-html';

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

// Simplified plugin interface focused on editor needs
export interface Plugin {
    name: string; // Plugin name (kebab-case) for the plugin attribute
    contracts: Contract[]; // Array of available contracts
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
    plugins: Plugin[]; // New plugin system
    installedApps: InstalledApp[]; // Legacy - for backward compatibility
    installedAppContracts: {
        [appName: string]: InstalledAppContracts;
    };
}

export interface GetProjectInfoResponse extends BaseResponse {
    type: 'getProjectInfo';
    info: ProjectInfo;
}

export interface InstalledAppContracts {
    appName: string;
    module: string;
    pages: Array<{
        pageName: string;
        contract: Contract;
    }>;
    components: Array<{
        componentName: string;
        contract: Contract;
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
