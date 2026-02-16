import { describe, it, expect } from 'vitest';
import { parseAction } from '../../lib';
import { compileAction } from '../../lib';

describe('Action Compiler', () => {
    function compile(yaml: string): string {
        const parsed = parseAction(yaml, 'test.jay-action');
        const result = compileAction(parsed);
        expect(result.validations).toEqual([]);
        return result.val!;
    }

    it('should generate Input interface from inputSchema', () => {
        const yaml = `
name: searchProducts
description: Search for products
inputSchema:
  type: object
  properties:
    query:
      type: string
    limit:
      type: number
  required:
    - query
`;
        expect(compile(yaml)).toEqual(
            `export interface SearchProductsInput {\n` +
                `  query: string;\n` +
                `  limit?: number;\n` +
                `}`,
        );
    });

    it('should generate Output type from outputSchema (object)', () => {
        const yaml = `
name: submitMood
description: Submit a mood
inputSchema:
  type: object
  properties:
    mood:
      type: string
  required:
    - mood
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    id:
      type: string
  required:
    - success
`;
        expect(compile(yaml)).toEqual(
            `export interface SubmitMoodInput {\n` +
                `  mood: string;\n` +
                `}\n` +
                `\n` +
                `export interface SubmitMoodOutput {\n` +
                `  success: boolean;\n` +
                `  id?: string;\n` +
                `}`,
        );
    });

    it('should generate Output type from outputSchema (array)', () => {
        const yaml = `
name: listProducts
description: List products
inputSchema:
  type: object
  properties:
    page:
      type: number
  required:
    - page
outputSchema:
  type: array
  items:
    type: object
    properties:
      id:
        type: string
      name:
        type: string
`;
        expect(compile(yaml)).toEqual(
            `export interface ListProductsInput {\n` +
                `  page: number;\n` +
                `}\n` +
                `\n` +
                `export type ListProductsOutput = Array<{\n` +
                `    id?: string;\n` +
                `    name?: string;\n` +
                `  }>;`,
        );
    });

    it('should handle enum properties', () => {
        const yaml = `
name: setMood
description: Set mood
inputSchema:
  type: object
  properties:
    mood:
      type: string
      enum:
        - happy
        - sad
        - neutral
  required:
    - mood
`;
        expect(compile(yaml)).toEqual(
            `export interface SetMoodInput {\n` + `  mood: 'happy' | 'sad' | 'neutral';\n` + `}`,
        );
    });

    it('should handle nested objects in input', () => {
        const yaml = `
name: createOrder
description: Create an order
inputSchema:
  type: object
  properties:
    customer:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
      required:
        - name
        - email
    total:
      type: number
  required:
    - customer
    - total
`;
        expect(compile(yaml)).toEqual(
            `export interface CreateOrderInput {\n` +
                `  customer: {\n` +
                `    name: string;\n` +
                `    email: string;\n` +
                `  };\n` +
                `  total: number;\n` +
                `}`,
        );
    });

    it('should generate only Input when no outputSchema', () => {
        const yaml = `
name: doSomething
description: Does something
inputSchema:
  type: object
  properties:
    value:
      type: string
`;
        expect(compile(yaml)).toEqual(
            `export interface DoSomethingInput {\n` + `  value?: string;\n` + `}`,
        );
    });

    it('should handle boolean type', () => {
        const yaml = `
name: toggleFlag
description: Toggle a flag
inputSchema:
  type: object
  properties:
    enabled:
      type: boolean
  required:
    - enabled
`;
        expect(compile(yaml)).toEqual(
            `export interface ToggleFlagInput {\n` + `  enabled: boolean;\n` + `}`,
        );
    });

    it('should handle array input property', () => {
        const yaml = `
name: batchProcess
description: Process batch
inputSchema:
  type: object
  properties:
    ids:
      type: array
      items:
        type: string
  required:
    - ids
`;
        expect(compile(yaml)).toEqual(
            `export interface BatchProcessInput {\n` + `  ids: Array<string>;\n` + `}`,
        );
    });

    it('should handle empty properties (no-input action)', () => {
        const yaml = `
name: healthCheck
description: Health check
inputSchema:
  type: object
  properties: {}
`;
        expect(compile(yaml)).toEqual(`export interface HealthCheckInput {}`);
    });
});
