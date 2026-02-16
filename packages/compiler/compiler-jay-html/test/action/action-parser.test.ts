import { describe, it, expect } from 'vitest';
import { parseAction } from '../../lib/action/action-parser';

describe('Action Parser', () => {
    it('should parse a valid .jay-action with input and output schemas', () => {
        const yaml = `
name: searchProducts
description: Search for products by query string. Returns matching products.
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Search query text
    limit:
      type: number
      description: Maximum results to return
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
        const result = parseAction(yaml, 'search-products.jay-action');

        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();
        expect(result.val!.name).toBe('searchProducts');
        expect(result.val!.description).toBe(
            'Search for products by query string. Returns matching products.',
        );
        expect(result.val!.inputSchema.type).toBe('object');
        expect(result.val!.inputSchema.properties.query).toEqual({
            type: 'string',
            description: 'Search query text',
        });
        expect(result.val!.inputSchema.properties.limit).toEqual({
            type: 'number',
            description: 'Maximum results to return',
            default: 10,
        });
        expect(result.val!.inputSchema.required).toEqual(['query']);
        expect(result.val!.outputSchema).toBeDefined();
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
        const result = parseAction(yaml, 'submit-mood.jay-action');

        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();
        expect(result.val!.name).toBe('submitMood');
        expect(result.val!.outputSchema).toBeUndefined();
    });

    it('should report validation error for missing name', () => {
        const yaml = `
description: Some action
inputSchema:
  type: object
  properties:
    x:
      type: string
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations.some((v) => v.includes('name'))).toBe(true);
    });

    it('should report validation error for missing description', () => {
        const yaml = `
name: testAction
inputSchema:
  type: object
  properties:
    x:
      type: string
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations.some((v) => v.includes('description'))).toBe(true);
    });

    it('should report validation error for missing inputSchema', () => {
        const yaml = `
name: testAction
description: A test
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.length).toBeGreaterThan(0);
        expect(result.validations.some((v) => v.includes('inputSchema'))).toBe(true);
    });

    it('should report validation error for non-object inputSchema', () => {
        const yaml = `
name: testAction
description: A test
inputSchema:
  type: string
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.length).toBeGreaterThan(0);
    });

    it('should throw on malformed YAML', () => {
        expect(() => parseAction('{{invalid yaml', 'bad.jay-action')).toThrow();
    });
});
