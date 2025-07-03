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
  pages: [{
    route: string;
    jayHtml: string;
    name: string;
  }];
}

export interface SaveImageMessage extends BaseMessage<SaveImageResponse> {
  type: 'saveImage';
  imageId: string;
  imageData: string; // base64 encoded image data
}

export interface HasImageMessage extends BaseMessage<HasImageResponse> {
  type: 'hasImage';
  imageId: string;
}

// Response types with discriminators
export interface PublishResponse extends BaseResponse {
  type: 'publish';
  status: [{
    success: boolean;
    filePath?: string;
    error?: string;
  }];
}

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

// Union types for all messages and responses
export interface ProtocolMessage {
  id: string,
  timestamp: number,
  payload: PublishMessage | SaveImageMessage | HasImageMessage;
}
export interface ProtocolResponse {
  id: string,
  timestamp: number,
  payload: PublishResponse | SaveImageResponse | HasImageResponse
}

// Editor side interface for communicating with dev server
export interface EditorProtocol {
  // Publish jay-html files to the dev server
  publish(params: PublishMessage): Promise<PublishResponse>;

  // Save an image to the local dev server
  saveImage(params: SaveImageMessage): Promise<SaveImageResponse>;

  // Check if a previously saved image exists
  hasImage(params: HasImageMessage): Promise<HasImageResponse>;
}

// Dev server side interface for handling editor requests
export interface DevServerProtocol {
  // Handle jay-html publication requests
  onPublish(callback: (params: PublishMessage) => Promise<PublishResponse>): void;

  // Handle image save requests
  onSaveImage(callback: (params: SaveImageMessage) => Promise<SaveImageResponse>): void;

  // Handle image existence check requests
  onHasImage(callback: (params: HasImageMessage) => Promise<HasImageResponse>): void;
} 