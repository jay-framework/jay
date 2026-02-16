import { describe, it, expect } from 'vitest';
import { parseAction, compileAction } from '../../lib';

describe('Action Compiler (compact notation)', () => {
    function compile(yaml: string): string {
        const parsed = parseAction(yaml, 'test.jay-action');
        const result = compileAction(parsed);
        expect(result.validations).toEqual([]);
        return result.val!;
    }

    it('should generate Input interface with required and optional props', () => {
        const yaml = `
name: searchProducts
description: Search for products
inputSchema:
  query: string
  limit?: number
`;
        expect(compile(yaml)).toEqual(
            `export interface SearchProductsInput {\n` +
                `  query: string;\n` +
                `  limit?: number;\n` +
                `}`,
        );
    });

    it('should generate Output interface from object output', () => {
        const yaml = `
name: submitMood
description: Submit a mood
inputSchema:
  mood: string
outputSchema:
  success: boolean
  id?: string
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

    it('should generate Output type alias for array output', () => {
        const yaml = `
name: listProducts
description: List products
inputSchema:
  page: number
outputSchema:
  - id: string
    name: string
`;
        expect(compile(yaml)).toEqual(
            `export interface ListProductsInput {\n` +
                `  page: number;\n` +
                `}\n` +
                `\n` +
                `export type ListProductsOutput = Array<{\n` +
                `    id: string;\n` +
                `    name: string;\n` +
                `  }>;`,
        );
    });

    it('should handle enum properties', () => {
        const yaml = `
name: setMood
description: Set mood
inputSchema:
  mood: enum(happy | sad | neutral)
`;
        expect(compile(yaml)).toEqual(
            `export interface SetMoodInput {\n` + `  mood: 'happy' | 'sad' | 'neutral';\n` + `}`,
        );
    });

    it('should handle nested objects', () => {
        const yaml = `
name: createOrder
description: Create an order
inputSchema:
  customer:
    name: string
    email: string
  total: number
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
  value?: string
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
  enabled: boolean
`;
        expect(compile(yaml)).toEqual(
            `export interface ToggleFlagInput {\n` + `  enabled: boolean;\n` + `}`,
        );
    });

    it('should handle array shorthand: string[]', () => {
        const yaml = `
name: batchProcess
description: Process batch
inputSchema:
  ids: string[]
`;
        expect(compile(yaml)).toEqual(
            `export interface BatchProcessInput {\n` + `  ids: Array<string>;\n` + `}`,
        );
    });

    it('should handle empty input', () => {
        const yaml = `
name: healthCheck
description: Health check
inputSchema: {}
`;
        expect(compile(yaml)).toEqual(`export interface HealthCheckInput {}`);
    });

    it('should generate contract import and use ViewState type in output', () => {
        const yaml = `
name: searchProducts
description: Search products
import:
  productCard: product-card.jay-contract
inputSchema:
  query: string
outputSchema:
  products:
    - productCard
  totalCount: number
  hasMore: boolean
`;
        expect(compile(yaml)).toEqual(
            `import { ProductCardViewState } from './product-card.jay-contract';\n` +
                `\n` +
                `export interface SearchProductsInput {\n` +
                `  query: string;\n` +
                `}\n` +
                `\n` +
                `export interface SearchProductsOutput {\n` +
                `  products: Array<ProductCardViewState>;\n` +
                `  totalCount: number;\n` +
                `  hasMore: boolean;\n` +
                `}`,
        );
    });

    it('should generate nullable contract output', () => {
        const yaml = `
name: getProductBySlug
description: Get product by slug
import:
  productCard: product-card.jay-contract
inputSchema:
  slug: string
outputSchema: productCard?
`;
        expect(compile(yaml)).toEqual(
            `import { ProductCardViewState } from './product-card.jay-contract';\n` +
                `\n` +
                `export interface GetProductBySlugInput {\n` +
                `  slug: string;\n` +
                `}\n` +
                `\n` +
                `export type GetProductBySlugOutput = ProductCardViewState | null;`,
        );
    });

    it('should generate non-nullable contract output', () => {
        const yaml = `
name: getProduct
description: Get product
import:
  productCard: product-card.jay-contract
inputSchema:
  id: string
outputSchema: productCard
`;
        expect(compile(yaml)).toEqual(
            `import { ProductCardViewState } from './product-card.jay-contract';\n` +
                `\n` +
                `export interface GetProductInput {\n` +
                `  id: string;\n` +
                `}\n` +
                `\n` +
                `export type GetProductOutput = ProductCardViewState;`,
        );
    });

    it('should use custom contract resolver', () => {
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
`;
        const parsed = parseAction(yaml, 'test.jay-action');
        const result = compileAction(parsed, (subpath) => ({
            importPath: '../contracts/' + subpath,
            viewStateName: 'MyProductCard',
        }));
        expect(result.validations).toEqual([]);
        expect(result.val).toContain(
            "import { MyProductCard } from '../contracts/product-card.jay-contract';",
        );
        expect(result.val).toContain('products: Array<MyProductCard>;');
    });
});
