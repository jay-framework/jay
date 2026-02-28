import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { Contract } from '@jay-framework/editor-protocol';
import {
    generateVariantScenarios,
    parseDataTypeString,
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
});

describe('generateVariantScenarios', () => {
    function makeBody(html: string) {
        return parse(html).querySelector('body')!;
    }

    it('returns empty for no contract', () => {
        const body = makeBody('<body><div if="flag">hello</div></body>');
        expect(generateVariantScenarios(body, undefined)).toEqual([]);
    });

    it('returns empty for contract with no tags', () => {
        const body = makeBody('<body><div if="flag">hello</div></body>');
        const contract: Contract = { name: 'test', tags: [] };
        expect(generateVariantScenarios(body, contract)).toEqual([]);
    });

    it('returns empty for no if conditions', () => {
        const body = makeBody('<body><div>hello</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'title', type: 'data', dataType: 'string' }],
        };
        expect(generateVariantScenarios(body, contract)).toEqual([]);
    });

    it('generates scenarios for boolean variant', () => {
        const body = makeBody('<body><div if="isLoading">Loading...</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'isLoading', type: 'variant', dataType: 'boolean' }],
        };
        const scenarios = generateVariantScenarios(body, contract);

        expect(scenarios).toHaveLength(3); // default + true + false
        expect(scenarios[0]).toEqual({
            id: 'default',
            contractValues: {},
            queryString: '',
        });
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

    it('generates scenarios for enum variant with == conditions', () => {
        const body = makeBody(
            '<body><div if="mediaType == IMAGE">img</div><div if="mediaType == VIDEO">vid</div></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'mediaType', type: 'variant', dataType: 'enum (IMAGE | VIDEO)' }],
        };
        const scenarios = generateVariantScenarios(body, contract);

        expect(scenarios).toHaveLength(3); // default + IMAGE + VIDEO
        expect(scenarios[0].id).toBe('default');
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

    it('handles multiple dimensions (boolean + enum)', () => {
        const body = makeBody(
            '<body><div if="isSearching">search</div><div if="mediaType == IMAGE">img</div></body>',
        );
        const contract: Contract = {
            name: 'test',
            tags: [
                { tag: 'isSearching', type: 'variant', dataType: 'boolean' },
                { tag: 'mediaType', type: 'variant', dataType: 'enum (IMAGE | VIDEO)' },
            ],
        };
        const scenarios = generateVariantScenarios(body, contract);

        // default + isSearching=true + isSearching=false + mediaType=IMAGE + mediaType=VIDEO
        expect(scenarios).toHaveLength(5);
        const ids = scenarios.map((s) => s.id);
        expect(ids).toContain('default');
        expect(ids).toContain('isSearching=true');
        expect(ids).toContain('isSearching=false');
        expect(ids).toContain('mediaType=IMAGE');
        expect(ids).toContain('mediaType=VIDEO');
    });

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
        // 3 booleans * 2 values = 6 + 1 default = 7 total, but limit to 4
        const scenarios = generateVariantScenarios(body, contract, 4);
        expect(scenarios).toHaveLength(4);
        expect(scenarios[0].id).toBe('default');
    });

    it('ignores string tags not useful for scenarios', () => {
        const body = makeBody('<body><div if="title">has title</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'title', type: 'data', dataType: 'string' }],
        };
        const scenarios = generateVariantScenarios(body, contract);
        expect(scenarios).toEqual([]);
    });

    it('uses vs. query param format', () => {
        const body = makeBody('<body><div if="inStock">In Stock</div></body>');
        const contract: Contract = {
            name: 'test',
            tags: [{ tag: 'inStock', type: 'variant', dataType: 'boolean' }],
        };
        const scenarios = generateVariantScenarios(body, contract);
        const trueScenario = scenarios.find((s) => s.id === 'inStock=true');
        expect(trueScenario?.queryString).toBe('?vs.inStock=true');
    });

    it('handles nested path conditions', () => {
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
        const scenarios = generateVariantScenarios(body, contract);
        const ids = scenarios.map((s) => s.id);
        expect(ids).toContain('product.inStock=true');
        expect(ids).toContain('product.inStock=false');

        const trueScenario = scenarios.find((s) => s.id === 'product.inStock=true');
        expect(trueScenario?.queryString).toBe('?vs.product.inStock=true');
    });
});
