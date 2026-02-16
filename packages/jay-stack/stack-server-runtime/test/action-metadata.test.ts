import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    parseActionMetadata,
    loadActionMetadata,
    resolveActionMetadataPath,
} from '../lib/action-metadata';

describe('Action Metadata (compact notation)', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'action-metadata-test-'));
    });

    afterEach(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    describe('parseActionMetadata', () => {
        it('should parse a valid .jay-action file with compact notation', () => {
            const yaml = `
name: searchProducts
description: Search for products by query string
inputSchema:
  query: string
  limit?: number
outputSchema:
  - id: string
    name: string
    price: number
`;
            const result = parseActionMetadata(yaml, 'search-products.jay-action');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('searchProducts');
            expect(result!.description).toBe('Search for products by query string');
            expect(result!.inputSchema.type).toBe('object');
            expect(result!.inputSchema.properties.query).toEqual({ type: 'string' });
            expect(result!.inputSchema.properties.limit).toEqual({ type: 'number' });
            expect(result!.inputSchema.required).toEqual(['query']);
            expect(result!.outputSchema).toBeDefined();
            expect(result!.outputSchema!.type).toBe('array');
        });

        it('should parse enum types', () => {
            const yaml = `
name: submitMood
description: Submit a mood entry
inputSchema:
  mood: enum(happy | neutral | sad)
`;
            const result = parseActionMetadata(yaml, 'submit-mood.jay-action');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('submitMood');
            expect(result!.inputSchema.properties.mood).toEqual({
                type: 'string',
                enum: ['happy', 'neutral', 'sad'],
            });
            expect(result!.inputSchema.required).toEqual(['mood']);
            expect(result!.outputSchema).toBeUndefined();
        });

        it('should parse nested objects with optional properties', () => {
            const yaml = `
name: search
description: Search
inputSchema:
  query: string
  filters?:
    minPrice?: number
    maxPrice?: number
`;
            const result = parseActionMetadata(yaml, 'search.jay-action');

            expect(result).not.toBeNull();
            expect(result!.inputSchema.required).toEqual(['query']);
            expect(result!.inputSchema.properties.filters.type).toBe('object');
            expect(result!.inputSchema.properties.filters.properties!.minPrice).toEqual({
                type: 'number',
            });
        });

        it('should parse contract imports', () => {
            const yaml = `
name: searchProducts
description: Search
import:
  productCard: product-card.jay-contract
inputSchema:
  query: string
outputSchema:
  products:
    - productCard
  totalCount: number
`;
            const result = parseActionMetadata(yaml, 'search.jay-action');

            expect(result).not.toBeNull();
            expect(result!.outputSchema!.type).toBe('object');
            expect(result!.outputSchema!.properties!.products.type).toBe('array');
            expect(result!.outputSchema!.properties!.products.items!.type).toBe('object');
            expect(result!.outputSchema!.properties!.totalCount).toEqual({ type: 'number' });
            expect(result!.outputSchema!.required).toEqual(['products', 'totalCount']);
        });

        it('should parse array shorthand: string[]', () => {
            const yaml = `
name: batch
description: Batch
inputSchema:
  ids: string[]
`;
            const result = parseActionMetadata(yaml, 'batch.jay-action');

            expect(result).not.toBeNull();
            expect(result!.inputSchema.properties.ids).toEqual({
                type: 'array',
                items: { type: 'string' },
            });
        });

        it('should parse empty input', () => {
            const yaml = `
name: healthCheck
description: Health check
inputSchema: {}
`;
            const result = parseActionMetadata(yaml, 'health.jay-action');

            expect(result).not.toBeNull();
            expect(result!.inputSchema.properties).toEqual({});
        });

        it('should return null for missing name', () => {
            const yaml = `
description: Some action
inputSchema:
  x: string
`;
            const result = parseActionMetadata(yaml, 'test.jay-action');
            expect(result).toBeNull();
        });

        it('should return null for missing description', () => {
            const yaml = `
name: testAction
inputSchema:
  x: string
`;
            const result = parseActionMetadata(yaml, 'test.jay-action');
            expect(result).toBeNull();
        });

        it('should return null for missing inputSchema', () => {
            const yaml = `
name: testAction
description: A test action
`;
            const result = parseActionMetadata(yaml, 'test.jay-action');
            expect(result).toBeNull();
        });

        it('should return null for empty YAML', () => {
            const result = parseActionMetadata('', 'test.jay-action');
            expect(result).toBeNull();
        });
    });

    describe('loadActionMetadata', () => {
        it('should load metadata from a file', async () => {
            const filePath = path.join(tempDir, 'test.jay-action');
            await fs.promises.writeFile(
                filePath,
                `
name: testAction
description: A test action
inputSchema:
  value: string
`,
            );

            const result = loadActionMetadata(filePath);

            expect(result).not.toBeNull();
            expect(result!.name).toBe('testAction');
            expect(result!.description).toBe('A test action');
            expect(result!.inputSchema.required).toEqual(['value']);
        });

        it('should return null for non-existent file', () => {
            const result = loadActionMetadata(path.join(tempDir, 'nonexistent.jay-action'));
            expect(result).toBeNull();
        });
    });

    describe('resolveActionMetadataPath', () => {
        it('should resolve relative path against plugin directory', () => {
            const result = resolveActionMetadataPath(
                './actions/send-message.jay-action',
                '/project/plugins/gemini-agent',
            );
            expect(result).toBe('/project/plugins/gemini-agent/actions/send-message.jay-action');
        });
    });
});
