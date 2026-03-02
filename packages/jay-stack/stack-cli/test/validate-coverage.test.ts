import { describe, it, expect } from 'vitest';
import path from 'path';
import {
    flattenContractTags,
    extractExpressions,
    extractTagPath,
    validateJayFiles,
} from '../lib/validate';
import { ContractTagType, type ContractTag } from '@jay-framework/compiler-jay-html';

// --- Unit tests for extraction functions ---

describe('flattenContractTags', () => {
    it('should flatten simple tags', () => {
        const tags: ContractTag[] = [
            { tag: 'name', type: [ContractTagType.data] },
            { tag: 'price', type: [ContractTagType.data] },
        ];
        const result = flattenContractTags(tags);
        expect(result).toEqual([
            { path: 'name', required: false },
            { path: 'price', required: false },
        ]);
    });

    it('should handle required tags', () => {
        const tags: ContractTag[] = [
            { tag: 'name', type: [ContractTagType.data], required: true },
            { tag: 'price', type: [ContractTagType.data] },
        ];
        const result = flattenContractTags(tags);
        expect(result).toEqual([
            { path: 'name', required: true },
            { path: 'price', required: false },
        ]);
    });

    it('should flatten nested sub-contract tags', () => {
        const tags: ContractTag[] = [
            {
                tag: 'priceData',
                type: [ContractTagType.subContract],
                tags: [
                    { tag: 'currency', type: [ContractTagType.data] },
                    {
                        tag: 'formatted',
                        type: [ContractTagType.subContract],
                        tags: [
                            { tag: 'price', type: [ContractTagType.data] },
                            { tag: 'discountedPrice', type: [ContractTagType.data] },
                        ],
                    },
                ],
            },
        ];
        const result = flattenContractTags(tags);
        expect(result).toEqual([
            { path: 'priceData', required: false },
            { path: 'priceData.currency', required: false },
            { path: 'priceData.formatted', required: false },
            { path: 'priceData.formatted.price', required: false },
            { path: 'priceData.formatted.discountedPrice', required: false },
        ]);
    });

    it('should flatten repeated sub-contracts', () => {
        const tags: ContractTag[] = [
            {
                tag: 'items',
                type: [ContractTagType.subContract],
                repeated: true,
                trackBy: '_id',
                tags: [
                    { tag: '_id', type: [ContractTagType.data] },
                    { tag: 'name', type: [ContractTagType.data] },
                ],
            },
        ];
        const result = flattenContractTags(tags);
        expect(result).toEqual([
            { path: 'items', required: false },
            { path: 'items._id', required: false },
            { path: 'items.name', required: false },
        ]);
    });
});

describe('extractExpressions', () => {
    it('should extract single expression', () => {
        expect(extractExpressions('{name}')).toEqual(['name']);
    });

    it('should extract multiple expressions', () => {
        expect(extractExpressions('{name}, price: {price}')).toEqual(['name', 'price']);
    });

    it('should extract dotted path expressions', () => {
        expect(extractExpressions('{counter.count}')).toEqual(['counter.count']);
    });

    it('should return empty for text without expressions', () => {
        expect(extractExpressions('hello world')).toEqual([]);
    });

    it('should trim whitespace in expressions', () => {
        expect(extractExpressions('{ name }')).toEqual(['name']);
    });

    it('should extract from attribute-like values', () => {
        expect(extractExpressions('product-{_id}')).toEqual(['_id']);
    });
});

describe('extractTagPath', () => {
    it('should extract simple identifier', () => {
        expect(extractTagPath('name')).toBe('name');
    });

    it('should extract dotted path', () => {
        expect(extractTagPath('counter.count')).toBe('counter.count');
    });

    it('should extract deeply nested path', () => {
        expect(extractTagPath('priceData.formatted.price')).toBe('priceData.formatted.price');
    });

    it('should handle negation', () => {
        expect(extractTagPath('!inStock')).toBe('inStock');
    });

    it('should extract left side of === comparison', () => {
        expect(extractTagPath('type === physical')).toBe('type');
    });

    it('should extract left side of dotted path comparison', () => {
        expect(extractTagPath('counter.isPositive === positive')).toBe('counter.isPositive');
    });

    it('should extract left side of !== comparison', () => {
        expect(extractTagPath('type !== virtual')).toBe('type');
    });

    it('should return null for dot accessor', () => {
        expect(extractTagPath('.')).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(extractTagPath('')).toBeNull();
    });

    it('should return null for invalid expressions', () => {
        expect(extractTagPath('a + b')).toBeNull();
    });
});

// --- Integration test with fixture ---

describe('validateJayFiles tag coverage', () => {
    const fixtureDir = path.resolve(__dirname, './fixtures/validate/headless-coverage');

    it('should report tag coverage for headless imports', async () => {
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        expect(result.valid).toBe(true);
        expect(result.coverage).toHaveLength(1);

        const fileCoverage = result.coverage[0];
        expect(fileCoverage.contracts).toHaveLength(1);

        const contract = fileCoverage.contracts[0];
        expect(contract.key).toBe('widget');
        expect(contract.contractName).toBe('test-widget');
        // Used: title, price, items, items.name, addToCart = 5
        // Total: title, description, price, items, items._id, items.name, items.label, addToCart = 8
        expect(contract.totalTags).toBe(8);
        expect(contract.usedTags).toBe(5);
        expect(contract.unusedTags).toEqual(
            expect.arrayContaining(['description', 'items._id', 'items.label']),
        );
        expect(contract.unusedTags).toHaveLength(3);
        expect(contract.requiredUnusedTags).toEqual(['description']);
    });

    it('should return empty coverage for files without headless imports', async () => {
        const validDir = path.resolve(__dirname, './fixtures/validate/valid');
        const result = await validateJayFiles({ path: validDir });

        expect(result.valid).toBe(true);
        expect(result.coverage).toHaveLength(0);
    });
});
