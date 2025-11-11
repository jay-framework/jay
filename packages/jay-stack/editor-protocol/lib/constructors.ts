import type {
    ProtocolMessage,
    ProtocolResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    GetProjectConfigurationMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
    GetProjectConfigurationResponse,
    ProjectConfiguration,
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

export function createGetProjectConfigurationMessage(): GetProjectConfigurationMessage {
    return {
        type: 'getProjectConfiguration',
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

export function createGetProjectConfigurationResponse(
    configuration: ProjectConfiguration,
    success: boolean = true,
    error?: string,
): GetProjectConfigurationResponse {
    return {
        type: 'getProjectConfiguration',
        success,
        configuration,
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
export function createProtocolMessage(payload: EditorProtocolMessageTypes): ProtocolMessage {
    return {
        id: generateMessageId(),
        timestamp: Date.now(),
        payload,
    };
}

export function createProtocolResponse(
    id: string,
    payload: EditorProtocolResponseTypes,
): ProtocolResponse {
    return {
        id,
        timestamp: Date.now(),
        payload,
    };
}
