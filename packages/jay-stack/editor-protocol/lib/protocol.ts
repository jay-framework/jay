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

// Message types
export interface PublishMessage {
  pages: [{
    route: string;
    jayHtml: string;
    name: string;
  }];
}

export interface SaveImageMessage {
  imageId: string;
  imageData: string; // base64 encoded image data
}

export interface HasImageMessage {
  imageId: string;
}

// Response types
export interface PublishResponse {
  status: [{
    success: boolean;
    filePath?: string;
    error?: string;
  }];
}

export interface SaveImageResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface HasImageResponse {
  exists: boolean;
  imageUrl?: string;
} 