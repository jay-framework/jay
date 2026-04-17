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

// Simplified plugin interface focused on editor needs
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
}

// --- Freeze management (DL#128) ---

export interface FreezeEntry {
    id: string;
    name?: string;
    route: string;
    createdAt: string;
}

export interface ListRoutesMessage extends BaseMessage<ListRoutesResponse> {
    type: 'listRoutes';
}

export interface ListRoutesResponse extends BaseResponse {
    type: 'listRoutes';
    routes: Array<{ path: string; jayHtmlPath: string }>;
}

export interface ListFreezesMessage extends BaseMessage<ListFreezesResponse> {
    type: 'listFreezes';
    route: string;
}

export interface ListFreezesResponse extends BaseResponse {
    type: 'listFreezes';
    freezes: FreezeEntry[];
}

export interface RenameFreezeMessage extends BaseMessage<RenameFreezeResponse> {
    type: 'renameFreeze';
    id: string;
    name: string;
}

export interface RenameFreezeResponse extends BaseResponse {
    type: 'renameFreeze';
}

export interface DeleteFreezeMessage extends BaseMessage<DeleteFreezeResponse> {
    type: 'deleteFreeze';
    id: string;
}

export interface DeleteFreezeResponse extends BaseResponse {
    type: 'deleteFreeze';
}

// Union types for all messages and responses
export type EditorProtocolMessageTypes<TVendorDoc> =
    | PublishMessage
    | SaveImageMessage
    | HasImageMessage
    | GetProjectInfoMessage
    | ExportMessage<TVendorDoc>
    | ImportMessage<TVendorDoc>
    | ListRoutesMessage
    | ListFreezesMessage
    | RenameFreezeMessage
    | DeleteFreezeMessage;

export type EditorProtocolResponseTypes<TVendorDoc> =
    | PublishResponse
    | SaveImageResponse
    | HasImageResponse
    | GetProjectInfoResponse
    | ExportResponse
    | ImportResponse<TVendorDoc>
    | ListRoutesResponse
    | ListFreezesResponse
    | RenameFreezeResponse
    | DeleteFreezeResponse;

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
    publish(params: PublishMessage): Promise<PublishResponse>;
    saveImage(params: SaveImageMessage): Promise<SaveImageResponse>;
    hasImage(params: HasImageMessage): Promise<HasImageResponse>;
    getProjectInfo(params: GetProjectInfoMessage): Promise<GetProjectInfoResponse>;
    export<TVendorDoc>(params: ExportMessage<TVendorDoc>): Promise<ExportResponse>;
    import<TVendorDoc>(params: ImportMessage<TVendorDoc>): Promise<ImportResponse<TVendorDoc>>;
    // Freeze management (DL#128)
    listRoutes(params: ListRoutesMessage): Promise<ListRoutesResponse>;
    listFreezes(params: ListFreezesMessage): Promise<ListFreezesResponse>;
    renameFreeze(params: RenameFreezeMessage): Promise<RenameFreezeResponse>;
    deleteFreeze(params: DeleteFreezeMessage): Promise<DeleteFreezeResponse>;
}

// Dev server side interface for handling editor requests
export interface DevServerProtocol {
    onPublish(callback: EditorProtocol['publish']): void;
    onSaveImage(callback: EditorProtocol['saveImage']): void;
    onHasImage(callback: EditorProtocol['hasImage']): void;
    onGetProjectInfo(callback: EditorProtocol['getProjectInfo']): void;
    onExport(callback: EditorProtocol['export']): void;
    onImport(callback: EditorProtocol['import']): void;
    // Freeze management (DL#128)
    onListRoutes(callback: EditorProtocol['listRoutes']): void;
    onListFreezes(callback: EditorProtocol['listFreezes']): void;
    onRenameFreeze(callback: EditorProtocol['renameFreeze']): void;
    onDeleteFreeze(callback: EditorProtocol['deleteFreeze']): void;
    /** Emit freeze-changed event to all connected clients */
    emitFreezeChanged(): void;
}
