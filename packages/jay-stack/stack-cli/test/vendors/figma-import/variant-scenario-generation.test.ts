import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { Contract, ContractTag } from '@jay-framework/editor-protocol';
import {
    generateVariantScenarios,
    parseDataTypeString,
    buildPreviewScenarioUrl,
} from '../../../lib/vendors/figma/computed-style-enricher';

describe('parseDataTypeString', () => {
    it('parses boolean', () => {
        expect(parseDataTypeString('boolean')).toEqual({ kind: 'boolean' });
    });

    it('parses string', () => {
        expect(parseDataTypeString('string')).toEqual({ kind: 'string' });
    });

    it('parses number', () => {
        expect(parseDataTypeString('number')).toEqual({ kind: 'number' });
    });

    it('parses enum with values', () => {
        expect(parseDataTypeString('enum (IMAGE | VIDEO)')).toEqual({
            kind: 'enum',
            enumValues: ['IMAGE', 'VIDEO'],
        });
    });

    it('parses enum without spaces', () => {
        expect(parseDataTypeString('enum(digital|physical)')).toEqual({
            kind: 'enum',
            enumValues: ['digital', 'physical'],
        });
    });

    it('returns other for unknown types', () => {
        expect(parseDataTypeString('custom-type')).toEqual({ kind: 'other' });
    });

    it('returns other for undefined', () => {
        expect(parseDataTypeString(undefined)).toEqual({ kind: 'other' });
    });

    it('handles JayType objects (compiler format)', () => {
        expect(parseDataTypeString({ name: 'boolean', kind: 0 })).toEqual({ kind: 'boolean' });
        expect(parseDataTypeString({ name: 'string', kind: 0 })).toEqual({ kind: 'string' });
        expect(parseDataTypeString({ name: 'number', kind: 0 })).toEqual({ kind: 'number' });
        expect(
            parseDataTypeString({
                name: 'AvailabilityStatus',
                kind: 2,
                values: ['IN_STOCK', 'OUT_OF_STOCK'],
            }),
        ).toEqual({
            kind: 'enum',
            enumValues: ['IN_STOCK', 'OUT_OF_STOCK'],
        });
        expect(parseDataTypeString({ name: 'Unknown', kind: 0 })).toEqual({ kind: 'other' });
    });
});

describe('buildPreviewScenarioUrl', () => {
    it('adds preview=1 to default scenario URL', () => {
        const url = buildPreviewScenarioUrl('http://localhost:3000', '/products', '');
        expect(url).toBe('http://localhost:3000/products?preview=1');
    });

    it('preserves vs.* params and appends preview=1', () => {
        const url = buildPreviewScenarioUrl(
            'http://localhost:3000',
            '/products',
            '?vs.hasResults=true&vs.searchTerm=shoes',
        );
        expect(url).toBe(
            'http://localhost:3000/products?vs.hasResults=true&vs.searchTerm=shoes&preview=1',
        );
    });

    it('forces preview=1 when preview already exists in scenario params', () => {
        const url = buildPreviewScenarioUrl(
            'http://localhost:3000',
            '/products',
            '?vs.hasResults=true&preview=0',
        );
        expect(url).toBe('http://localhost:3000/products?vs.hasResults=true&preview=1');
    });
});

describe('generateVariantScenarios (condition-driven)', () => {
    function makeBody(html: string) {
        return parse(html).querySelector('body')!;
    }

    it('returns empty for no contract tags', () => {
        const body = makeBody('<body><div if="flag">hello</div></body>');
        expect(generateVariantScenarios(body, [])).toEqual([]);
    });

    it('returns empty for no if conditions', () => {
        const body = makeBody('<body><div>hello</div></body>');
        const tags: ContractTag[] = [{ tag: 'title', type: 'data', dataType: 'string' }];
        expect(generateVariantScenarios(body, tags)).toEqual([]);
    });

    // --- Boolean conditions ---

    it('generates one scenario per boolean if condition', () => {
        const body = makeBody(
            '<body><div if="isLoading">Loading...</div><div if="!isLoading">Content</div></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'isLoading', type: 'variant', dataType: 'boolean' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(3);
        expect(scenarios[0].id).toBe('default');
        expect(scenarios[1]).toEqual({
            id: 'isLoading=true',
            contractValues: { isLoading: 'true' },
            queryString: '?vs.isLoading=true',
        });
        expect(scenarios[2]).toEqual({
            id: 'isLoading=false',
            contractValues: { isLoading: 'false' },
            queryString: '?vs.isLoading=false',
        });
    });

    // --- Enum conditions ---

    it('generates one scenario per enum equality condition', () => {
        const body = makeBody(
            '<body><div if="mediaType == IMAGE">img</div><div if="mediaType == VIDEO">vid</div></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'mediaType', type: 'variant', dataType: 'enum (IMAGE | VIDEO)' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(3);
        expect(scenarios[1]).toEqual({
            id: 'mediaType=IMAGE',
            contractValues: { mediaType: 'IMAGE' },
            queryString: '?vs.mediaType=IMAGE',
        });
        expect(scenarios[2]).toEqual({
            id: 'mediaType=VIDEO',
            contractValues: { mediaType: 'VIDEO' },
            queryString: '?vs.mediaType=VIDEO',
        });
    });

    it('handles != condition by picking alternative enum value', () => {
        const body = makeBody('<body><div if="mediaType != IMAGE">Not an image</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'mediaType', type: 'variant', dataType: 'enum (IMAGE | VIDEO | AUDIO)' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1].id).toBe('mediaType=VIDEO');
    });

    // --- String truthy conditions (real pattern: if="brand.name") ---

    it('generates scenario for string truthy condition', () => {
        const body = makeBody('<body><p if="brand.name">{brand.name}</p></body>');
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'brand',
                    type: 'data',
                    tags: [{ tag: 'name', type: 'data', dataType: 'string' }],
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'brand.name=Sample',
            contractValues: { 'brand.name': 'Sample' },
            queryString: '?vs.brand.name=Sample',
        });
    });

    it('generates scenario for negated string condition', () => {
        const body = makeBody('<body><span if="!imageUrl">No image</span></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'imageUrl', type: 'data', dataType: 'string' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'imageUrl=',
            contractValues: { imageUrl: '' },
            queryString: '?vs.imageUrl=',
        });
    });

    // --- Comparison operator conditions (real pattern: if="itemCount > 0") ---

    it('generates scenario for > comparison', () => {
        const body = makeBody('<body><div if="itemCount > 0">Has items</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'itemCount', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'itemCount=1',
            contractValues: { itemCount: '1' },
            queryString: '?vs.itemCount=1',
        });
    });

    it('generates scenario for >= comparison', () => {
        const body = makeBody('<body><div if="quantity >= 5">Bulk pricing</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'quantity', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'quantity=5',
            contractValues: { quantity: '5' },
            queryString: '?vs.quantity=5',
        });
    });

    it('generates scenario for < comparison', () => {
        const body = makeBody('<body><div if="stock < 10">Low stock</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'stock', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'stock=9',
            contractValues: { stock: '9' },
            queryString: '?vs.stock=9',
        });
    });

    it('generates scenario for <= comparison', () => {
        const body = makeBody('<body><div if="rating <= 0">No rating</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'rating', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'rating=0',
            contractValues: { rating: '0' },
            queryString: '?vs.rating=0',
        });
    });

    it('generates scenario for == 0 comparison (itemCount == 0)', () => {
        const body = makeBody('<body><div if="itemCount == 0">Empty cart</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'itemCount', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'itemCount=0',
            contractValues: { itemCount: '0' },
            queryString: '?vs.itemCount=0',
        });
    });

    // --- Number truthy ---

    it('generates scenario for number truthy condition', () => {
        const body = makeBody('<body><span if="itemCount">({itemCount})</span></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'itemCount', type: 'data', dataType: 'number' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'itemCount=1',
            contractValues: { itemCount: '1' },
            queryString: '?vs.itemCount=1',
        });
    });

    // --- Compound conditions ---

    it('generates compound scenario for && condition', () => {
        const body = makeBody('<body><div if="isSearching && hasResults">Results</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [
                { tag: 'isSearching', type: 'variant', dataType: 'boolean' },
                { tag: 'hasResults', type: 'variant', dataType: 'boolean' },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'hasResults=true&isSearching=true',
            contractValues: { hasResults: 'true', isSearching: 'true' },
            queryString: '?vs.hasResults=true&vs.isSearching=true',
        });
    });

    it('generates compound scenario with mixed types (enum && boolean)', () => {
        const body = makeBody(
            `<body><button if="quickAddType == SIMPLE && inventory.availabilityStatus == IN_STOCK">Add</button></body>`,
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'quickAddType',
                    type: 'variant',
                    dataType: 'enum (SIMPLE | SINGLE_OPTION | NEEDS_CONFIGURATION)',
                },
                {
                    tag: 'inventory',
                    type: 'data',
                    tags: [
                        {
                            tag: 'availabilityStatus',
                            type: 'variant',
                            dataType: 'enum (IN_STOCK | OUT_OF_STOCK)',
                        },
                    ],
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'inventory.availabilityStatus=IN_STOCK&quickAddType=SIMPLE',
            contractValues: { 'inventory.availabilityStatus': 'IN_STOCK', quickAddType: 'SIMPLE' },
            queryString: '?vs.inventory.availabilityStatus=IN_STOCK&vs.quickAddType=SIMPLE',
        });
    });

    it('generates compound scenario with comparison and boolean', () => {
        const body = makeBody(
            '<body><span if="productSearch.hasMore && !productSearch.isSearching">Load more</span></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'productSearch',
                    type: 'data',
                    tags: [
                        { tag: 'hasMore', type: 'variant', dataType: 'boolean' },
                        { tag: 'isSearching', type: 'variant', dataType: 'boolean' },
                    ],
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'productSearch.hasMore=true&productSearch.isSearching=false',
            contractValues: {
                'productSearch.hasMore': 'true',
                'productSearch.isSearching': 'false',
            },
            queryString: '?vs.productSearch.hasMore=true&vs.productSearch.isSearching=false',
        });
    });

    it('generates compound with comparison and negated string', () => {
        const body = makeBody(
            '<body><span if="!productSearch.hasMore && productSearch.totalCount > 0">All loaded</span></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'productSearch',
                    type: 'data',
                    tags: [
                        { tag: 'hasMore', type: 'variant', dataType: 'boolean' },
                        { tag: 'totalCount', type: 'data', dataType: 'number' },
                    ],
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'productSearch.hasMore=false&productSearch.totalCount=1',
            contractValues: {
                'productSearch.hasMore': 'false',
                'productSearch.totalCount': '1',
            },
            queryString: '?vs.productSearch.hasMore=false&vs.productSearch.totalCount=1',
        });
    });

    // --- Deduplication ---

    it('deduplicates identical conditions', () => {
        const body = makeBody(
            '<body><div if="inStock">In Stock</div><span if="inStock">Badge</span></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'inStock', type: 'variant', dataType: 'boolean' }],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1].id).toBe('inStock=true');
    });

    // --- Independent conditions ---

    it('generates distinct scenarios for independent conditions', () => {
        const body = makeBody(
            `<body>
                <div if="inStock">In Stock</div>
                <div if="!inStock">Out of Stock</div>
                <div if="mediaType == IMAGE">Image</div>
                <div if="mediaType == VIDEO">Video</div>
            </body>`,
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                { tag: 'inStock', type: 'variant', dataType: 'boolean' },
                { tag: 'mediaType', type: 'variant', dataType: 'enum (IMAGE | VIDEO)' },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);
        const ids = scenarios.map((s) => s.id);

        expect(scenarios).toHaveLength(5);
        expect(ids).toContain('inStock=true');
        expect(ids).toContain('inStock=false');
        expect(ids).toContain('mediaType=IMAGE');
        expect(ids).toContain('mediaType=VIDEO');
    });

    // --- Limits ---

    it('respects maxScenarios limit', () => {
        const body = makeBody(
            '<body><div if="a">x</div><div if="b">y</div><div if="c">z</div></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                { tag: 'a', type: 'variant', dataType: 'boolean' },
                { tag: 'b', type: 'variant', dataType: 'boolean' },
                { tag: 'c', type: 'variant', dataType: 'boolean' },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags, 3);
        expect(scenarios).toHaveLength(3); // default + 2 (capped)
        expect(scenarios[0].id).toBe('default');
    });

    // --- Nested paths ---

    it('handles nested path conditions with vs. prefix', () => {
        const body = makeBody('<body><div if="product.inStock">In Stock</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'product',
                    type: 'data',
                    tags: [{ tag: 'inStock', type: 'variant', dataType: 'boolean' }],
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);

        expect(scenarios).toHaveLength(2);
        expect(scenarios[1]).toEqual({
            id: 'product.inStock=true',
            contractValues: { 'product.inStock': 'true' },
            queryString: '?vs.product.inStock=true',
        });
    });

    // --- Real-world store-light page pattern ---

    it('handles store-light product page conditions', () => {
        const body = makeBody(
            `<body>
                <span if="cartIndicator.hasItems">{cartIndicator.itemCount}</span>
                <div if="productSearch.isSearching">Loading...</div>
                <div if="productSearch.hasSuggestions">Suggestions</div>
                <div if="!productSearch.hasResults">No products found</div>
                <div if="productSearch.hasResults">Products grid</div>
                <span if="hasRibbon">{ribbon.name}</span>
                <span if="inventory.availabilityStatus == IN_STOCK">In Stock</span>
                <span if="inventory.availabilityStatus == OUT_OF_STOCK">Sold Out</span>
                <p if="brand.name">{brand.name}</p>
                <span if="hasDiscount">{priceData.formatted.discountedPrice}</span>
                <button if="quickAddType == SIMPLE && inventory.availabilityStatus == IN_STOCK">Add</button>
                <div if="quickAddType == SINGLE_OPTION && inventory.availabilityStatus != OUT_OF_STOCK">Options</div>
                <div if="inventory.availabilityStatus == OUT_OF_STOCK">Sold out</div>
                <div if="productSearch.isSearching">Loading indicator</div>
                <button if="productSearch.hasMore && !productSearch.isSearching">Load More</button>
                <span if="!productSearch.hasMore && productSearch.totalCount > 0">Showing all</span>
            </body>`,
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                {
                    tag: 'cartIndicator',
                    type: 'data',
                    tags: [{ tag: 'hasItems', type: 'variant', dataType: 'boolean' }],
                },
                {
                    tag: 'productSearch',
                    type: 'data',
                    tags: [
                        { tag: 'isSearching', type: 'variant', dataType: 'boolean' },
                        { tag: 'hasSuggestions', type: 'variant', dataType: 'boolean' },
                        { tag: 'hasResults', type: 'variant', dataType: 'boolean' },
                        { tag: 'hasMore', type: 'variant', dataType: 'boolean' },
                        { tag: 'totalCount', type: 'data', dataType: 'number' },
                    ],
                },
                { tag: 'hasRibbon', type: 'variant', dataType: 'boolean' },
                {
                    tag: 'inventory',
                    type: 'data',
                    tags: [
                        {
                            tag: 'availabilityStatus',
                            type: 'variant',
                            dataType: 'enum (IN_STOCK | OUT_OF_STOCK)',
                        },
                    ],
                },
                {
                    tag: 'brand',
                    type: 'data',
                    tags: [{ tag: 'name', type: 'data', dataType: 'string' }],
                },
                { tag: 'hasDiscount', type: 'variant', dataType: 'boolean' },
                {
                    tag: 'quickAddType',
                    type: 'variant',
                    dataType: 'enum (SIMPLE | SINGLE_OPTION | NEEDS_CONFIGURATION)',
                },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract.tags);
        const ids = scenarios.map((s) => s.id);

        // Verify key patterns all generate scenarios
        expect(ids).toContain('cartIndicator.hasItems=true');
        expect(ids).toContain('productSearch.isSearching=true');
        expect(ids).toContain('productSearch.hasSuggestions=true');
        expect(ids).toContain('productSearch.hasResults=false');
        expect(ids).toContain('productSearch.hasResults=true');
        expect(ids).toContain('hasRibbon=true');
        expect(ids).toContain('inventory.availabilityStatus=IN_STOCK');
        expect(ids).toContain('inventory.availabilityStatus=OUT_OF_STOCK');
        expect(ids).toContain('brand.name=Sample'); // string truthy
        expect(ids).toContain('hasDiscount=true');

        // Compound conditions
        expect(ids).toContain('inventory.availabilityStatus=IN_STOCK&quickAddType=SIMPLE');
        expect(ids).toContain('inventory.availabilityStatus=IN_STOCK&quickAddType=SINGLE_OPTION'); // != OUT_OF_STOCK → IN_STOCK
        expect(ids).toContain('productSearch.hasMore=true&productSearch.isSearching=false');
        expect(ids).toContain('productSearch.hasMore=false&productSearch.totalCount=1');
    });
});
