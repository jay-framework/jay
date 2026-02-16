import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    parseActionMetadata,
    loadActionMetadata,
    resolveActionMetadataPath,
} from '../lib/action-metadata';

describe('Action Metadata', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'action-metadata-test-'));
    });

    afterEach(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    describe('parseActionMetadata', () => {
        it('should parse a valid .jay-action file', () => {
            const yaml = `
name: searchProducts
description: Search for products by query string
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Search query text
    limit:
      type: number
      description: Maximum results
      default: 10
  required:
    - query
outputSchema:
  type: array
  items:
    type: object
    properties:
      id:
        type: string
      name:
        type: string
      price:
        type: number
`;
            const result = parseActionMetadata(yaml, 'search-products.jay-action');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('searchProducts');
            expect(result!.description).toBe('Search for products by query string');
            expect(result!.inputSchema.type).toBe('object');
            expect(result!.inputSchema.properties.query.type).toBe('string');
            expect(result!.inputSchema.properties.limit.type).toBe('number');
            expect(result!.inputSchema.required).toEqual(['query']);
            expect(result!.outputSchema).toBeDefined();
            expect(result!.outputSchema!.type).toBe('array');
        });

        it('should parse action without outputSchema', () => {
            const yaml = `
name: submitMood
description: Submit a mood entry
inputSchema:
  type: object
  properties:
    mood:
      type: string
      enum:
        - happy
        - neutral
        - sad
  required:
    - mood
`;
            const result = parseActionMetadata(yaml, 'submit-mood.jay-action');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('submitMood');
            expect(result!.outputSchema).toBeUndefined();
        });

        it('should return null for missing name', () => {
            const yaml = `
description: Some action
inputSchema:
  type: object
  properties:
    x:
      type: string
`;
            const result = parseActionMetadata(yaml, 'test.jay-action');
            expect(result).toBeNull();
        });

        it('should return null for missing description', () => {
            const yaml = `
name: testAction
inputSchema:
  type: object
  properties:
    x:
      type: string
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

        it('should return null for inputSchema without object type', () => {
            const yaml = `
name: testAction
description: A test action
inputSchema:
  type: string
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
  type: object
  properties:
    value:
      type: string
  required:
    - value
`,
            );

            const result = loadActionMetadata(filePath);

            expect(result).not.toBeNull();
            expect(result!.name).toBe('testAction');
            expect(result!.description).toBe('A test action');
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
