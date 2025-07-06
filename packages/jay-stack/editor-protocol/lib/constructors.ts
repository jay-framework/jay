import { v4 as uuidv4 } from 'uuid';
import type {
  ProtocolMessage,
  ProtocolResponse,
  PublishMessage,
  SaveImageMessage,
  HasImageMessage,
  PublishResponse,
  SaveImageResponse,
  HasImageResponse
} from './protocol';

// Message constructors
export function createPublishMessage(pages: PublishMessage['pages']): PublishMessage {
  return {
    type: 'publish',
    pages
  };
}

export function createSaveImageMessage(imageId: string, imageData: string): SaveImageMessage {
  return {
    type: 'saveImage',
    imageId,
    imageData
  };
}

export function createHasImageMessage(imageId: string): HasImageMessage {
  return {
    type: 'hasImage',
    imageId
  };
}

// Response constructors
export function createPublishResponse(status: PublishResponse['status']): PublishResponse {
  return {
    type: 'publish',
    success: status.every(s => s.success),
    status
  };
}

export function createSaveImageResponse(success: boolean, imageUrl?: string, error?: string): SaveImageResponse {
  return {
    type: 'saveImage',
    success,
    imageUrl,
    error
  };
}

export function createHasImageResponse(exists: boolean, imageUrl?: string): HasImageResponse {
  return {
    type: 'hasImage',
    success: true,
    exists,
    imageUrl
  };
}

// Protocol wrapper constructors
export function createProtocolMessage(payload: PublishMessage | SaveImageMessage | HasImageMessage): ProtocolMessage {
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    payload
  };
}

export function createProtocolResponse(
  id: string,
  payload: PublishResponse | SaveImageResponse | HasImageResponse
): ProtocolResponse {
  return {
    id,
    timestamp: Date.now(),
    payload
  };
}

// Convenience constructors for common scenarios
export function createSuccessfulPublishResponse(filePaths: string[]): PublishResponse {
  return createPublishResponse(
    filePaths.map(filePath => ({
      success: true,
      filePath
    }))
  );
}

export function createFailedPublishResponse(errors: string[]): PublishResponse {
  return createPublishResponse(
    errors.map(error => ({
      success: false,
      error
    }))
  );
}

export function createSuccessfulSaveImageResponse(imageUrl: string): SaveImageResponse {
  return createSaveImageResponse(true, imageUrl);
}

export function createFailedSaveImageResponse(error: string): SaveImageResponse {
  return createSaveImageResponse(false, undefined, error);
}

export function createImageExistsResponse(imageUrl: string): HasImageResponse {
  return createHasImageResponse(true, imageUrl);
}

export function createImageNotExistsResponse(): HasImageResponse {
  return createHasImageResponse(false);
} 