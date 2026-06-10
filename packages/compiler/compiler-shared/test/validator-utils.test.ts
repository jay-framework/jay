import { describe, it, expect } from 'vitest';
import { resolveBinding, walkElements, type DataScope } from '../lib';
import type { JayHtmlValidationContext } from '../lib';

describe('resolveBinding', () => {
    const scope: DataScope = {
        tags: [
            { tag: 'title', type: [0], meta: undefined },
            {
                tag: 'gallery',
                type: [3],
                tags: [
                    {
                        tag: 'url',
                        type: [0],
                        meta: { vendor: 'wix-image', defaultTransform: 'w_300,h_200' },
                    },
                    { tag: 'alt', type: [0] },
                ],
            },
        ],
    };

    it('should resolve a simple tag', () => {
        const result = resolveBinding('title', scope);
        expect(result.path).toBe('title');
        expect(result.tag?.tag).toBe('title');
    });

    it('should resolve a nested tag', () => {
        const result = resolveBinding('gallery.url', scope);
        expect(result.path).toBe('gallery.url');
        expect(result.tag?.tag).toBe('url');
        expect(result.tag?.meta).toEqual({
            vendor: 'wix-image',
            defaultTransform: 'w_300,h_200',
        });
    });

    it('should return no tag for nonexistent path', () => {
        const result = resolveBinding('missing.path', scope);
        expect(result.path).toBe('missing.path');
        expect(result.tag).toBeUndefined();
    });

    it('should return no tag when intermediate has no children', () => {
        const result = resolveBinding('title.deep', scope);
        expect(result.tag).toBeUndefined();
    });
});

describe('walkElements', () => {
    function makeElement(
        tagName: string,
        attrs: Record<string, string> = {},
        children: any[] = [],
    ): any {
        return {
            nodeType: 1,
            rawTagName: tagName,
            getAttribute: (name: string) => attrs[name],
            attributes: attrs,
            childNodes: children,
        };
    }

    it('should visit all elements depth-first', () => {
        const child1 = makeElement('span');
        const child2 = makeElement('p');
        const root = makeElement('div', {}, [child1, child2]);

        const visited: string[] = [];
        const ctx: JayHtmlValidationContext = {
            body: root,
            filePath: 'test.jay-html',
            projectRoot: '/root',
            headlessImports: [],
        };

        walkElements(root, ctx, (el) => {
            visited.push(el.rawTagName);
        });

        expect(visited).toEqual(['div', 'span', 'p']);
    });

    it('should push scope at jay:component boundary', () => {
        const inner = makeElement('span');
        const jayComp = makeElement('jay:product-card', {}, [inner]);
        const root = makeElement('div', {}, [jayComp]);

        const scopes: DataScope[] = [];
        const ctx: JayHtmlValidationContext = {
            body: root,
            filePath: 'test.jay-html',
            projectRoot: '/root',
            contract: {
                name: 'page',
                tags: [{ tag: 'pageTitle', type: [0] }],
            },
            headlessImports: [
                {
                    contractName: 'product-card',
                    contract: {
                        name: 'product-card',
                        tags: [{ tag: 'productName', type: [0] }],
                    },
                },
            ],
        };

        walkElements(root, ctx, (el, scope) => {
            if (el.rawTagName === 'span') {
                scopes.push(scope);
            }
        });

        expect(scopes).toHaveLength(1);
        expect(scopes[0].tags).toEqual([{ tag: 'productName', type: [0] }]);
        expect(scopes[0].parent?.tags).toEqual([{ tag: 'pageTitle', type: [0] }]);
    });

    it('should push scope at forEach boundary', () => {
        const inner = makeElement('span');
        const forEachDiv = makeElement('div', { forEach: 'items' }, [inner]);
        const root = makeElement('div', {}, [forEachDiv]);

        const scopes: DataScope[] = [];
        const ctx: JayHtmlValidationContext = {
            body: root,
            filePath: 'test.jay-html',
            projectRoot: '/root',
            contract: {
                name: 'page',
                tags: [
                    {
                        tag: 'items',
                        type: [3],
                        repeated: true,
                        tags: [
                            { tag: 'name', type: [0] },
                            {
                                tag: 'url',
                                type: [0],
                                meta: { vendor: 'wix-image' },
                            },
                        ],
                    },
                ],
            },
            headlessImports: [],
        };

        walkElements(root, ctx, (el, scope) => {
            if (el.rawTagName === 'span') {
                scopes.push(scope);
            }
        });

        expect(scopes).toHaveLength(1);
        expect(scopes[0].tags).toHaveLength(2);
        expect(scopes[0].tags[0].tag).toBe('name');
        expect(scopes[0].tags[1].meta).toEqual({ vendor: 'wix-image' });
    });

    it('should resolve headless-keyed forEach path', () => {
        const inner = makeElement('span');
        const forEachDiv = makeElement('div', { forEach: 'productSearch.searchResults' }, [inner]);
        const root = makeElement('div', {}, [forEachDiv]);

        const scopes: DataScope[] = [];
        const ctx: JayHtmlValidationContext = {
            body: root,
            filePath: 'test.jay-html',
            projectRoot: '/root',
            headlessImports: [
                {
                    key: 'productSearch',
                    contractName: 'product-search',
                    contract: {
                        name: 'product-search',
                        tags: [
                            {
                                tag: 'searchResults',
                                type: [3],
                                repeated: true,
                                tags: [
                                    { tag: 'title', type: [0] },
                                    { tag: 'thumbnail', type: [0], meta: { vendor: 'wix-image' } },
                                ],
                            },
                        ],
                    },
                },
            ],
        };

        walkElements(root, ctx, (el, scope) => {
            if (el.rawTagName === 'span') {
                scopes.push(scope);
            }
        });

        expect(scopes).toHaveLength(1);
        expect(scopes[0].tags).toHaveLength(2);
        expect(scopes[0].tags[0].tag).toBe('title');
        expect(scopes[0].tags[1].meta).toEqual({ vendor: 'wix-image' });
    });
});
