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
}

export class DefaultProtocolHandlers {
  private projectRoot: string;
  private assetsDir: string;

  constructor(options: DefaultHandlersOptions) {
    this.projectRoot = options.projectRoot;
    this.assetsDir = options.assetsDir || join(this.projectRoot, 'public', 'assets');
    
    // Ensure assets directory exists
    if (!existsSync(this.assetsDir)) {
      mkdirSync(this.assetsDir, { recursive: true });
    }
  }

  async handlePublish(params: PublishMessage): Promise<PublishResponse> {
    const { pages } = params;
    const results = [];

    for (const page of pages) {
      try {
        const { route, jayHtml, name } = page;
        const filePath = join(this.projectRoot, route, `${name}.jay-html`);
        
        // Ensure directory exists
        const dir = join(this.projectRoot, route);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Write the jay-html file
        writeFileSync(filePath, jayHtml, 'utf8');
        
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

    return { status: results as [{ success: boolean; filePath?: string; error?: string; }] };
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
      writeFileSync(filePath, buffer);
      
      // Return the URL that will be accessible via the dev server
      const imageUrl = `/assets/${fileName}`;
      
      return {
        success: true,
        imageUrl
      };
    } catch (error) {
      return {
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
        
        if (existsSync(filePath)) {
          const imageUrl = `/assets/${fileName}`;
          return {
            exists: true,
            imageUrl
          };
        }
      }
      
      return {
        exists: false
      };
    } catch (error) {
      return {
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