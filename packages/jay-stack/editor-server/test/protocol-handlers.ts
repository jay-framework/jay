import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { 
  PublishMessage, 
  SaveImageMessage, 
  HasImageMessage,
  PublishResponse,
  SaveImageResponse,
  HasImageResponse
} from '@jay-framework/editor-protocol';

export interface DefaultHandlersOptions {
  projectRoot: string;
  assetsDir?: string;
  // For testing: allow mocking file system operations
  mockFileSystem?: {
    writeFile?: (path: string, content: string | Buffer) => void;
    existsSync?: (path: string) => boolean;
    mkdirSync?: (path: string, options?: any) => void;
  };
}

export class DefaultProtocolHandlers {
  private projectRoot: string;
  private assetsDir: string;
  private mockFileSystem?: DefaultHandlersOptions['mockFileSystem'];

  constructor(options: DefaultHandlersOptions) {
    this.projectRoot = options.projectRoot;
    this.assetsDir = options.assetsDir || join(this.projectRoot, 'public', 'assets');
    this.mockFileSystem = options.mockFileSystem;
    
    // Ensure assets directory exists (unless mocking)
    if (!this.mockFileSystem && !existsSync(this.assetsDir)) {
      mkdirSync(this.assetsDir, { recursive: true });
    }
  }

  async handlePublish(params: PublishMessage): Promise<PublishResponse> {
    const { pages } = params;
    const results: PublishResponse["status"] = [];

    for (const page of pages) {
      try {
        const { route, jayHtml, name } = page;
        const filePath = join(this.projectRoot, route, `${name}.jay-html`);
        
        // Ensure directory exists
        const dir = join(this.projectRoot, route);
        if (this.mockFileSystem) {
          if (!this.mockFileSystem.existsSync!(dir)) {
            this.mockFileSystem.mkdirSync!(dir, { recursive: true });
          }
          this.mockFileSystem.writeFile!(filePath, jayHtml);
        } else {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(filePath, jayHtml, 'utf8');
        }
        
        results.push({
          success: true,
          filePath: filePath
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      type: 'publish',
      success: true,
      status: results
    };
  }

  async handleSaveImage(params: SaveImageMessage): Promise<SaveImageResponse> {
    const { imageId, imageData } = params;
    
    try {
      // Remove data URL prefix if present
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Determine file extension from image data
      const extension = this.getImageExtension(imageData);
      const fileName = `${imageId}${extension}`;
      const filePath = join(this.assetsDir, fileName);
      
      // Write the image file
      if (this.mockFileSystem) {
        this.mockFileSystem.writeFile!(filePath, buffer);
      } else {
        writeFileSync(filePath, buffer);
      }
      
      // Return the URL that will be accessible via the dev server
      const imageUrl = `/assets/${fileName}`;
      
      return {
        type: 'saveImage',
        success: true,
        imageUrl
      };
    } catch (error) {
      return {
        type: 'saveImage',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async handleHasImage(params: HasImageMessage): Promise<HasImageResponse> {
    const { imageId } = params;
    
    try {
      // Check for common image extensions
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
      
      for (const extension of extensions) {
        const fileName = `${imageId}${extension}`;
        const filePath = join(this.assetsDir, fileName);
        
        const fileExists = this.mockFileSystem 
          ? this.mockFileSystem.existsSync!(filePath)
          : existsSync(filePath);
        
        if (fileExists) {
          const imageUrl = `/assets/${fileName}`;
          return {
            type: 'hasImage',
            success: true,
            exists: true,
            imageUrl
          };
        }
      }
      
      return {
        type: 'hasImage',
        success: true,
        exists: false
      };
    } catch (error) {
      return {
        type: 'hasImage',
        success: false,
        exists: false
      };
    }
  }

  private getImageExtension(imageData: string): string {
    if (imageData.startsWith('data:image/png;base64,')) return '.png';
    if (imageData.startsWith('data:image/jpeg;base64,')) return '.jpg';
    if (imageData.startsWith('data:image/jpg;base64,')) return '.jpg';
    if (imageData.startsWith('data:image/gif;base64,')) return '.gif';
    if (imageData.startsWith('data:image/webp;base64,')) return '.webp';
    if (imageData.startsWith('data:image/svg+xml;base64,')) return '.svg';
    
    // Default to PNG if we can't determine the type
    return '.png';
  }
}

export function createDefaultHandlers(options: DefaultHandlersOptions): DefaultProtocolHandlers {
  return new DefaultProtocolHandlers(options);
} 