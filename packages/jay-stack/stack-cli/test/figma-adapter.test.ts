/**
 * Figma Adapter Tests
 * 
 * Tests specific to the Figma vendor adapter implementation.
 */

import { FigmaAdapter } from '../lib/vendor-adapters/figma/figma-adapter';
import { ConversionContext } from '../lib/vendor-adapters/types';
import { FigmaDoc } from '../lib/vendor-adapters/figma/types';

describe('FigmaAdapter', () => {
  let adapter: FigmaAdapter;
  let context: ConversionContext;
  
  beforeEach(() => {
    adapter = new FigmaAdapter();
    context = {
      pageDirectory: '/test/pages/home',
      pageUrl: '/home',
      projectRoot: '/test',
      pagesBase: '/test/pages'
    };
  });
  
  it('should have correct vendorId', () => {
    expect(adapter.vendorId).toBe('figma');
  });
  
  it('should convert a simple Figma document', async () => {
    const figmaDoc: FigmaDoc = {
      name: 'Home Page',
      nodeId: '123:456',
      type: 'FRAME',
      children: []
    };
    
    const result = await adapter.convert(figmaDoc, context);
    
    expect(result.success).toBe(true);
    expect(result.jayHtml).toBeDefined();
    expect(result.jayHtml).toContain('<view>');
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.length).toBeGreaterThan(0); // Placeholder warnings
  });
  
  it('should handle conversion errors gracefully', async () => {
    const invalidDoc = null as any;
    
    const result = await adapter.convert(invalidDoc, context);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.jayHtml).toBeUndefined();
  });
  
  it('should include node information in generated HTML', async () => {
    const figmaDoc: FigmaDoc = {
      name: 'Test Page',
      nodeId: 'test-123',
      type: 'COMPONENT',
      children: []
    };
    
    const result = await adapter.convert(figmaDoc, context);
    
    expect(result.jayHtml).toContain('Test Page');
    expect(result.jayHtml).toContain('test-123');
  });
  
  it('should handle documents with children', async () => {
    const figmaDoc: FigmaDoc = {
      name: 'Parent Frame',
      nodeId: 'parent-123',
      type: 'FRAME',
      children: [
        {
          name: 'Child 1',
          nodeId: 'child-1',
          type: 'TEXT'
        },
        {
          name: 'Child 2',
          nodeId: 'child-2',
          type: 'RECTANGLE'
        }
      ]
    };
    
    const result = await adapter.convert(figmaDoc, context);
    
    expect(result.success).toBe(true);
    expect(result.jayHtml).toBeDefined();
  });
  
  it('should include Figma node name in generated comment', async () => {
    const figmaDoc: FigmaDoc = {
      name: 'Product Page',
      nodeId: 'prod-123',
      type: 'PAGE',
      children: []
    };
    
    const result = await adapter.convert(figmaDoc, context);
    
    expect(result.jayHtml).toContain('Product Page');
    expect(result.jayHtml).toContain('prod-123');
  });
});

