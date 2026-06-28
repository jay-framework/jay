import { mergeContractStubRefs } from '../../lib/jay-target/jay-html-compiler-shared';
import { mkRefsTree, mkRef, JayUnknown, JayString, hasRefs } from '@jay-framework/compiler-shared';

describe('mergeContractStubRefs', () => {
    const makeRef = (name: string, repeated = false) =>
        mkRef(name, name, `ref${name}`, repeated, false, JayUnknown, JayString);

    const makeAutoRef = (name: string, repeated = false) =>
        mkRef(name, name, `ref${name}`, repeated, true, JayUnknown, JayString);

    it('should add missing root-level refs as stubs', () => {
        const template = mkRefsTree([makeRef('btnA')], {});
        const contract = mkRefsTree([makeRef('btnA'), makeRef('btnB')], {});

        const merged = mergeContractStubRefs(template, contract);

        expect(merged.refs).toHaveLength(2);
        expect(merged.refs[0].ref).toBe('btnA');
        expect(merged.refs[0].autoRef).toBe(false);
        expect(merged.refs[1].ref).toBe('btnB');
        expect(merged.refs[1].autoRef).toBe(true);
    });

    it('should add missing children from contract', () => {
        const template = mkRefsTree([], {});
        const contract = mkRefsTree([], {
            sortBy: mkRefsTree([makeRef('sortDropdown')], {}),
        });

        const merged = mergeContractStubRefs(template, contract);

        expect(Object.keys(merged.children)).toEqual(['sortBy']);
        expect(merged.children['sortBy'].refs).toHaveLength(1);
        expect(merged.children['sortBy'].refs[0].ref).toBe('sortDropdown');
        expect(merged.children['sortBy'].refs[0].autoRef).toBe(true);
    });

    it('should recursively merge children present in both', () => {
        const template = mkRefsTree([], {
            filters: mkRefsTree([makeRef('searchBtn')], {}),
        });
        const contract = mkRefsTree([], {
            filters: mkRefsTree([makeRef('searchBtn'), makeRef('clearBtn')], {}),
        });

        const merged = mergeContractStubRefs(template, contract);

        expect(merged.children['filters'].refs).toHaveLength(2);
        expect(merged.children['filters'].refs[0].ref).toBe('searchBtn');
        expect(merged.children['filters'].refs[0].autoRef).toBe(false);
        expect(merged.children['filters'].refs[1].ref).toBe('clearBtn');
        expect(merged.children['filters'].refs[1].autoRef).toBe(true);
    });

    it('should handle deeply nested children (category-products scenario)', () => {
        // Template: no refs at all
        const template = mkRefsTree([], {});

        // Contract: products (repeated) -> product-card refs
        const productCardRefs = mkRefsTree(
            [makeRef('addToCartButton'), makeRef('productLink')],
            {
                thumbnail: mkRefsTree([makeRef('imageRef')], {}),
            },
            true, // repeated
        );
        const contract = mkRefsTree([], { products: productCardRefs });

        const merged = mergeContractStubRefs(template, contract);

        expect(Object.keys(merged.children)).toEqual(['products']);
        const products = merged.children['products'];
        expect(products.refs).toHaveLength(2);
        expect(products.refs[0].autoRef).toBe(true);
        expect(products.refs[1].autoRef).toBe(true);
        expect(Object.keys(products.children)).toEqual(['thumbnail']);
        expect(products.children['thumbnail'].refs[0].autoRef).toBe(true);
        expect(hasRefs(merged, true)).toBe(true);
    });

    it('should return templateRefs unchanged when no stubs needed', () => {
        const template = mkRefsTree([makeRef('btn')], {});
        const contract = mkRefsTree([makeRef('btn')], {});

        const merged = mergeContractStubRefs(template, contract);

        expect(merged).toBe(template);
    });
});
