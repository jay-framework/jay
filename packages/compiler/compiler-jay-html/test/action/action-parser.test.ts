import { describe, it, expect } from 'vitest';
import { parseAction } from '../../lib';
import {
    JayObjectType,
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayOptionalType,
    isObjectType,
    isArrayType,
    isEnumType,
    isImportedType,
    isAtomicType,
    isOptionalType,
} from '@jay-framework/compiler-shared';

describe('Action Parser (compact notation → JayType)', () => {
    it('should parse a valid action with input and output', () => {
        const yaml = `
name: searchProducts
description: Search for products by query string.
inputSchema:
  query: string
  limit?: number
outputSchema:
  products:
    - name: string
      price: number
  totalCount: number
`;
        const result = parseAction(yaml, 'search-products.jay-action');

        expect(result.validations).toEqual([]);
        expect(result.val).toBeDefined();
        expect(result.val!.name).toBe('searchProducts');
        expect(result.val!.description).toBe('Search for products by query string.');

        const input = result.val!.inputType;
        expect(isObjectType(input)).toBe(true);
        expect(Object.keys(input.props)).toEqual(['query', 'limit']);
        expect(isAtomicType(input.props.query)).toBe(true);
        expect(input.props.query.name).toBe('string');
        expect(isOptionalType(input.props.query)).toBe(false);
        expect(isOptionalType(input.props.limit)).toBe(true);
        expect((input.props.limit as JayOptionalType).innerType.name).toBe('number');
    });

    it('should parse enum types as JayEnumType', () => {
        const yaml = `
name: setMood
description: Set mood
inputSchema:
  mood: enum(happy | sad | neutral)
`;
        const result = parseAction(yaml, 'set-mood.jay-action');

        expect(result.validations).toEqual([]);
        const moodType = result.val!.inputType.props.mood;
        expect(isEnumType(moodType)).toBe(true);
        expect((moodType as JayEnumType).values).toEqual(['happy', 'sad', 'neutral']);
    });

    it('should parse nested objects with optional properties', () => {
        const yaml = `
name: searchProducts
description: Search
inputSchema:
  query: string
  filters?:
    minPrice?: number
    maxPrice?: number
    inStockOnly?: boolean
`;
        const result = parseAction(yaml, 'search.jay-action');

        expect(result.validations).toEqual([]);
        const input = result.val!.inputType;
        expect(isOptionalType(input.props.filters)).toBe(true);

        const filters = (input.props.filters as JayOptionalType).innerType;
        expect(isObjectType(filters)).toBe(true);
        const filtersObj = filters as JayObjectType;
        expect(Object.keys(filtersObj.props)).toEqual(['minPrice', 'maxPrice', 'inStockOnly']);
        expect(isOptionalType(filtersObj.props.minPrice)).toBe(true);
        expect(isOptionalType(filtersObj.props.maxPrice)).toBe(true);
        expect(isOptionalType(filtersObj.props.inStockOnly)).toBe(true);
    });

    it('should parse contract imports as JayImportedType', () => {
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
`;
        const result = parseAction(yaml, 'search.jay-action');

        expect(result.validations).toEqual([]);
        expect(result.val!.imports).toEqual({ productCard: 'product-card.jay-contract' });

        const output = result.val!.outputType;
        expect(isObjectType(output)).toBe(true);
        const outputObj = output as JayObjectType;
        const productsType = outputObj.props.products;
        expect(isArrayType(productsType)).toBe(true);
        const itemType = (productsType as JayArrayType).itemType;
        expect(isImportedType(itemType)).toBe(true);
        expect(itemType.name).toBe('productCard');
        expect((itemType as JayImportedType).isOptional).toBe(false);
    });

    it('should parse nullable contract output', () => {
        const yaml = `
name: getProductBySlug
description: Get product by slug
import:
  productCard: product-card.jay-contract
inputSchema:
  slug: string
outputSchema: productCard?
`;
        const result = parseAction(yaml, 'get-product.jay-action');

        expect(result.validations).toEqual([]);
        const output = result.val!.outputType;
        expect(isImportedType(output)).toBe(true);
        expect(output!.name).toBe('productCard');
        expect((output as JayImportedType).isOptional).toBe(true);
    });

    it('should parse array output at top level', () => {
        const yaml = `
name: getCollections
description: Get collections
inputSchema: {}
outputSchema:
  - _id: string
    name: string
    slug: string
`;
        const result = parseAction(yaml, 'get-collections.jay-action');

        expect(result.validations).toEqual([]);
        expect(Object.keys(result.val!.inputType.props)).toEqual([]);
        expect(isArrayType(result.val!.outputType)).toBe(true);
    });

    it('should parse array shorthand: string[]', () => {
        const yaml = `
name: batchProcess
description: Process batch
inputSchema:
  ids: string[]
  tags?: number[]
`;
        const result = parseAction(yaml, 'batch.jay-action');

        expect(result.validations).toEqual([]);
        const ids = result.val!.inputType.props.ids;
        expect(isArrayType(ids)).toBe(true);
        expect(isAtomicType((ids as JayArrayType).itemType)).toBe(true);
        expect((ids as JayArrayType).itemType.name).toBe('string');

        expect(isOptionalType(result.val!.inputType.props.tags)).toBe(true);
        const tags = (result.val!.inputType.props.tags as JayOptionalType).innerType;
        expect(isArrayType(tags)).toBe(true);
    });

    it('should parse action without output', () => {
        const yaml = `
name: submitMood
description: Submit a mood entry
inputSchema:
  mood: enum(happy | neutral | sad)
`;
        const result = parseAction(yaml, 'submit-mood.jay-action');

        expect(result.validations).toEqual([]);
        expect(result.val!.outputType).toBeUndefined();
    });

    it('should parse empty input (no-input action)', () => {
        const yaml = `
name: healthCheck
description: Health check
inputSchema: {}
`;
        const result = parseAction(yaml, 'health.jay-action');

        expect(result.validations).toEqual([]);
        expect(Object.keys(result.val!.inputType.props)).toEqual([]);
    });

    it('should report error for missing name', () => {
        const yaml = `
description: Some action
inputSchema:
  x: string
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.some((v) => v.includes('name'))).toBe(true);
    });

    it('should report error for missing description', () => {
        const yaml = `
name: testAction
inputSchema:
  x: string
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.some((v) => v.includes('description'))).toBe(true);
    });

    it('should report error for missing inputSchema', () => {
        const yaml = `
name: testAction
description: A test
`;
        const result = parseAction(yaml, 'test.jay-action');
        expect(result.validations.some((v) => v.includes('inputSchema'))).toBe(true);
    });

    it('should throw on malformed YAML', () => {
        expect(() => parseAction('{{invalid yaml', 'bad.jay-action')).toThrow();
    });
});
