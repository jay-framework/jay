/**
 * Vendor Adapter System Tests
 *
 * Tests the vendor adapter registry and system behavior using mock adapters.
 * Specific vendor implementations (Figma, Wix, etc.) have their own test files.
 */

import {
    VendorAdapterRegistry,
    VendorAdapter,
    ConversionContext,
    ConversionResult,
} from '../lib/vendor-adapters/types';

/**
 * Mock vendor document for testing
 */
interface MockVendorDoc {
    title: string;
    elements: Array<{
        type: 'text' | 'button' | 'image';
        content: string;
    }>;
    metadata?: Record<string, any>;
}

/**
 * Mock adapter for testing the vendor adapter system
 */
class MockVendorAdapter implements VendorAdapter<MockVendorDoc> {
    readonly vendorId = 'mock-vendor';

    async convert(doc: MockVendorDoc, context: ConversionContext): Promise<ConversionResult> {
        try {
            // Simulate validation
            if (!doc || !doc.title) {
                throw new Error('Invalid document: missing title');
            }

            // Generate Jay HTML
            let jayHtml = `<!-- Generated from ${this.vendorId} for ${context.pageUrl} -->\n`;
            jayHtml += `<view>\n`;
            jayHtml += `  <text>${doc.title}</text>\n`;

            for (const element of doc.elements) {
                switch (element.type) {
                    case 'text':
                        jayHtml += `  <text>${element.content}</text>\n`;
                        break;
                    case 'button':
                        jayHtml += `  <button>${element.content}</button>\n`;
                        break;
                    case 'image':
                        jayHtml += `  <image src="${element.content}" />\n`;
                        break;
                }
            }

            jayHtml += `</view>\n`;

            // Generate contract if there are buttons
            let contract: string | undefined;
            const hasButtons = doc.elements.some((el) => el.type === 'button');
            if (hasButtons) {
                contract = `name: ${doc.title.replace(/\s+/g, '')}\n`;
                contract += `tags:\n`;
                contract += `  - tag: interactive\n`;
                contract += `    type: action\n`;
            }

            return {
                success: true,
                jayHtml,
                contract,
                warnings: [],
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Conversion failed',
            };
        }
    }
}

/**
 * Another mock adapter to test multiple vendors
 */
class AnotherMockAdapter implements VendorAdapter<{ name: string }> {
    readonly vendorId = 'another-mock';

    async convert(doc: { name: string }, context: ConversionContext): Promise<ConversionResult> {
        return {
            success: true,
            jayHtml: `<view><text>${doc.name}</text></view>`,
            warnings: [],
        };
    }
}

describe('Vendor Adapter System', () => {
    describe('VendorAdapterRegistry', () => {
        it('should register and retrieve adapters', () => {
            const registry = new VendorAdapterRegistry();
            const adapter = new MockVendorAdapter();

            registry.register(adapter);

            expect(registry.has('mock-vendor')).toBe(true);
            expect(registry.get('mock-vendor')).toBe(adapter);
            expect(registry.getVendorIds()).toContain('mock-vendor');
        });

        it('should return undefined for non-existent vendors', () => {
            const registry = new VendorAdapterRegistry();

            expect(registry.has('nonexistent')).toBe(false);
            expect(registry.get('nonexistent')).toBeUndefined();
        });

        it('should handle multiple adapters', () => {
            const registry = new VendorAdapterRegistry();
            const adapter1 = new MockVendorAdapter();
            const adapter2 = new AnotherMockAdapter();

            registry.register(adapter1);
            registry.register(adapter2);

            expect(registry.getVendorIds()).toContain('mock-vendor');
            expect(registry.getVendorIds()).toContain('another-mock');
            expect(registry.getVendorIds().length).toBe(2);
        });

        it('should allow overwriting adapters with the same vendorId', () => {
            const registry = new VendorAdapterRegistry();
            const adapter1 = new MockVendorAdapter();
            const adapter2 = new MockVendorAdapter();

            registry.register(adapter1);
            registry.register(adapter2);

            expect(registry.get('mock-vendor')).toBe(adapter2);
            expect(registry.getVendorIds().length).toBe(1);
        });
    });

    describe('MockVendorAdapter', () => {
        let adapter: MockVendorAdapter;
        let context: ConversionContext;

        beforeEach(() => {
            adapter = new MockVendorAdapter();
            context = {
                pageDirectory: '/test/pages/home',
                pageUrl: '/home',
                projectRoot: '/test',
                pagesBase: '/test/pages',
            };
        });

        it('should have correct vendorId', () => {
            expect(adapter.vendorId).toBe('mock-vendor');
        });

        it('should convert a simple document', async () => {
            const doc: MockVendorDoc = {
                title: 'Test Page',
                elements: [{ type: 'text', content: 'Hello World' }],
            };

            const result = await adapter.convert(doc, context);

            expect(result.success).toBe(true);
            expect(result.jayHtml).toBeDefined();
            expect(result.jayHtml).toContain('<view>');
            expect(result.jayHtml).toContain('Test Page');
            expect(result.jayHtml).toContain('Hello World');
        });

        it('should handle multiple elements', async () => {
            const doc: MockVendorDoc = {
                title: 'Multi-Element Page',
                elements: [
                    { type: 'text', content: 'Paragraph' },
                    { type: 'button', content: 'Click Me' },
                    { type: 'image', content: '/images/test.png' },
                ],
            };

            const result = await adapter.convert(doc, context);

            expect(result.success).toBe(true);
            expect(result.jayHtml).toContain('Paragraph');
            expect(result.jayHtml).toContain('<button>Click Me</button>');
            expect(result.jayHtml).toContain('<image src="/images/test.png" />');
        });

        it('should generate contract when document has buttons', async () => {
            const doc: MockVendorDoc = {
                title: 'Interactive Page',
                elements: [{ type: 'button', content: 'Submit' }],
            };

            const result = await adapter.convert(doc, context);

            expect(result.success).toBe(true);
            expect(result.contract).toBeDefined();
            expect(result.contract).toContain('name: InteractivePage');
            expect(result.contract).toContain('type: action');
        });

        it('should not generate contract for static content', async () => {
            const doc: MockVendorDoc = {
                title: 'Static Page',
                elements: [{ type: 'text', content: 'Just text' }],
            };

            const result = await adapter.convert(doc, context);

            expect(result.success).toBe(true);
            expect(result.contract).toBeUndefined();
        });

        it('should handle conversion errors gracefully', async () => {
            const invalidDoc = null as any;

            const result = await adapter.convert(invalidDoc, context);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('Invalid document');
            expect(result.jayHtml).toBeUndefined();
        });

        it('should include page URL in comment', async () => {
            const doc: MockVendorDoc = {
                title: 'Test',
                elements: [],
            };

            const result = await adapter.convert(doc, { ...context, pageUrl: '/products/123' });

            expect(result.jayHtml).toContain('/products/123');
        });
    });
});

/**
 * Integration Tests
 */
describe('Vendor Adapter Integration', () => {
    it('should handle the complete conversion flow', async () => {
        const registry = new VendorAdapterRegistry();
        const adapter = new MockVendorAdapter();
        registry.register(adapter);

        const doc: MockVendorDoc = {
            title: 'Integration Test',
            elements: [
                { type: 'text', content: 'Welcome' },
                { type: 'button', content: 'Get Started' },
            ],
        };

        const vendorId = 'mock-vendor';
        const retrievedAdapter = registry.get(vendorId);

        expect(retrievedAdapter).toBeDefined();

        if (retrievedAdapter) {
            const result = await retrievedAdapter.convert(doc, {
                pageDirectory: '/test/pages/integration',
                pageUrl: '/integration',
                projectRoot: '/test',
                pagesBase: '/test/pages',
            });

            expect(result.success).toBe(true);
            expect(result.jayHtml).toBeDefined();
            expect(result.contract).toBeDefined(); // Has button, so should generate contract

            // Verify the complete flow would produce:
            // 1. Save doc to page.mock-vendor.json
            // 2. Save result.jayHtml to page.jay-html
            // 3. Save result.contract to page.jay-contract
        }
    });

    it('should handle multiple vendors in the same registry', async () => {
        const registry = new VendorAdapterRegistry();
        const mockAdapter = new MockVendorAdapter();
        const anotherAdapter = new AnotherMockAdapter();

        registry.register(mockAdapter);
        registry.register(anotherAdapter);

        // Test mock-vendor
        const mockDoc: MockVendorDoc = {
            title: 'Mock Document',
            elements: [{ type: 'text', content: 'Content' }],
        };

        const mockResult = await registry.get('mock-vendor')!.convert(mockDoc, {
            pageDirectory: '/test/pages/mock',
            pageUrl: '/mock',
            projectRoot: '/test',
            pagesBase: '/test/pages',
        });

        expect(mockResult.success).toBe(true);

        // Test another-mock
        const anotherDoc = { name: 'Another Document' };

        const anotherResult = await registry.get('another-mock')!.convert(anotherDoc, {
            pageDirectory: '/test/pages/another',
            pageUrl: '/another',
            projectRoot: '/test',
            pagesBase: '/test/pages',
        });

        expect(anotherResult.success).toBe(true);
    });

    it('should handle errors without affecting the registry', async () => {
        const registry = new VendorAdapterRegistry();
        const adapter = new MockVendorAdapter();
        registry.register(adapter);

        // First, a successful conversion
        const validDoc: MockVendorDoc = {
            title: 'Valid',
            elements: [],
        };

        const successResult = await adapter.convert(validDoc, {
            pageDirectory: '/test',
            pageUrl: '/test',
            projectRoot: '/test',
            pagesBase: '/test/pages',
        });

        expect(successResult.success).toBe(true);

        // Then, a failed conversion
        const invalidDoc = null as any;
        const failResult = await adapter.convert(invalidDoc, {
            pageDirectory: '/test',
            pageUrl: '/test',
            projectRoot: '/test',
            pagesBase: '/test/pages',
        });

        expect(failResult.success).toBe(false);

        // Registry should still work
        expect(registry.has('mock-vendor')).toBe(true);
        expect(registry.get('mock-vendor')).toBe(adapter);
    });
});
