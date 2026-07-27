import type {
    ProtocolMessage,
    ProtocolResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    GetProjectInfoMessage,
    ExportMessage,
    ImportMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
    GetProjectInfoResponse,
    ExportResponse,
    ImportResponse,
    ProjectInfo,
    EditorProtocolMessageTypes,
    EditorProtocolResponseTypes,
} from './protocol';

// Message constructors
export function createPublishMessage(
    pages?: PublishMessage['pages'],
    components?: PublishMessage['components'],
): PublishMessage {
    return {
        type: 'publish',
        pages,
        components,
    };
}

export function createSaveImageMessage(imageId: string, imageData: string): SaveImageMessage {
    return {
        type: 'saveImage',
        imageId,
        imageData,
    };
}

export function createHasImageMessage(imageId: string): HasImageMessage {
    return {
        type: 'hasImage',
        imageId,
    };
}

export function createGetProjectInfoMessage(): GetProjectInfoMessage {
    return {
        type: 'getProjectInfo',
    };
}

export function createExportMessage<TVendorDoc>(
    vendorId: string,
    pageUrl: string,
    vendorDoc: TVendorDoc,
): ExportMessage<TVendorDoc> {
    return {
        type: 'export',
        vendorId,
        pageUrl,
        vendorDoc,
    };
}

export function createImportMessage<TVendorDoc>(
    vendorId: string,
    pageUrl: string,
): ImportMessage<TVendorDoc> {
    return {
        type: 'import',
        vendorId,
        pageUrl,
    };
}

// Response constructors
export function createPublishResponse(status: PublishResponse['status']): PublishResponse {
    return {
        type: 'publish',
        success: status.every((s) => s.success),
        status,
    };
}

export function createSaveImageResponse(
    success: boolean,
    imageUrl?: string,
    error?: string,
): SaveImageResponse {
    return {
        type: 'saveImage',
        success,
        imageUrl,
        error,
    };
}

export function createHasImageResponse(exists: boolean, imageUrl?: string): HasImageResponse {
    return {
        type: 'hasImage',
        success: true,
        exists,
        imageUrl,
    };
}

export function createGetProjectInfoResponse(
    info: ProjectInfo,
    success: boolean = true,
    error?: string,
): GetProjectInfoResponse {
    return {
        type: 'getProjectInfo',
        success,
        info,
        error,
    };
}

export function createExportResponse(
    success: boolean,
    vendorSourcePath?: string,
    jayHtmlPath?: string,
    contractPath?: string,
    warnings?: string[],
    error?: string,
): ExportResponse {
    return {
        type: 'export',
        success,
        vendorSourcePath,
        jayHtmlPath,
        contractPath,
        warnings,
        error,
    };
}

export function createImportResponse<TVendorDoc>(
    success: boolean,
    vendorDoc?: TVendorDoc,
    error?: string,
): ImportResponse<TVendorDoc> {
    return {
        type: 'import',
        success,
        vendorDoc,
        error,
    };
}

// Simple ID generator using timestamp + random number
let messageIdCounter = 0;
function generateMessageId(): string {
    const timestamp = Date.now();
    const counter = ++messageIdCounter;
    return `${timestamp}-${counter}`;
}

// Protocol wrapper constructors
export function createProtocolMessage<TVendorDoc>(
    payload: EditorProtocolMessageTypes<TVendorDoc>,
): ProtocolMessage<TVendorDoc> {
    return {
        id: generateMessageId(),
        timestamp: Date.now(),
        payload,
    };
}

export function createProtocolResponse<TVendorDoc>(
    id: string,
    payload: EditorProtocolResponseTypes<TVendorDoc>,
): ProtocolResponse<TVendorDoc> {
    return {
        id,
        timestamp: Date.now(),
        payload,
    };
}
