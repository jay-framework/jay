import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import {
    extractTextBindings,
    extractAttributeBindings,
    resolveBindingPath,
    extractBindingsFromElement,
} from '../../../lib/vendors/figma/binding-reconstructor';

const testContractTags: ContractTag[] = [
    { tag: 'productName', type: 'data', dataType: 'string' },
    { tag: 'price', type: 'data', dataType: 'string' },
    { tag: 'imageUrl', type: 'data', dataType: 'string' },
    { tag: 'link', type: 'data', dataType: 'string' },
    { tag: 'addToCart', type: 'interactive', elementType: 'HTMLButtonElement' },
    {
        tag: 'items',
        type: 'subContract',
        repeated: true,
        trackBy: 'id',
        tags: [{ tag: 'name', type: 'data', dataType: 'string' }],
    },
    { tag: 'mediaType', type: 'data', dataType: 'enum (IMAGE|VIDEO)' },
    { tag: 'value', type: ['data', 'interactive'], dataType: 'string' },
    {
        tag: 'product',
        type: 'subContract',
        tags: [{ tag: 'name', type: 'data', dataType: 'string' }],
    },
];

const pageContractPath = { pageUrl: '/test' };
const jayPageSectionId = 'section-1';

describe('binding-reconstructor', () => {
    describe('extractTextBindings', () => {
        it('extracts single path from braces', () => {
            expect(extractTextBindings('{productName}')).toEqual(['productName']);
        });

        it('extracts path with surrounding text', () => {
            expect(extractTextBindings('Price: {price}')).toEqual(['price']);
        });

        it('extracts multiple paths', () => {
            expect(extractTextBindings('{a} and {b}')).toEqual(['a', 'b']);
        });

        it('extracts from dollar syntax', () => {
            expect(extractTextBindings('Price: ${price}')).toEqual(['price']);
        });

        it('returns empty for no bindings', () => {
            expect(extractTextBindings('No bindings here')).toEqual([]);
        });

        it('returns empty for empty string', () => {
            expect(extractTextBindings('')).toEqual([]);
        });
    });

    describe('extractAttributeBindings', () => {
        it('extracts src and alt from img', () => {
            const doc = parse('<img src="{imageUrl}" alt="{name}">');
            const el = doc.querySelector('img')!;
            expect(extractAttributeBindings(el)).toEqual([
                { attribute: 'src', path: 'imageUrl' },
                { attribute: 'alt', path: 'name' },
            ]);
        });

        it('extracts href from anchor', () => {
            const doc = parse('<a href="{link}">text</a>');
            const el = doc.querySelector('a')!;
            expect(extractAttributeBindings(el)).toEqual([{ attribute: 'href', path: 'link' }]);
        });

        it('returns empty for static attributes', () => {
            const doc = parse('<img src="static.png">');
            const el = doc.querySelector('img')!;
            expect(extractAttributeBindings(el)).toEqual([]);
        });

        it('extracts value and placeholder from input', () => {
            const doc = parse('<input value="{value}" placeholder="{hint}">');
            const el = doc.querySelector('input')!;
            expect(extractAttributeBindings(el)).toEqual([
                { attribute: 'value', path: 'value' },
                { attribute: 'placeholder', path: 'hint' },
            ]);
        });
    });

    describe('resolveBindingPath', () => {
        it('resolves simple path against contract', () => {
            expect(resolveBindingPath('productName', testContractTags, [])).toEqual({
                tagPath: ['productName'],
                resolved: true,
            });
        });

        it('resolves nested path against contract', () => {
            expect(resolveBindingPath('product.name', testContractTags, [])).toEqual({
                tagPath: ['product', 'name'],
                resolved: true,
            });
        });

        it('returns unresolved for unknown path', () => {
            expect(resolveBindingPath('unknownField', testContractTags, [])).toEqual({
                tagPath: ['unknownField'],
                resolved: false,
            });
        });

        it('strips repeater prefix and resolves within repeater context', () => {
            expect(resolveBindingPath('items.name', testContractTags, [['items']])).toEqual({
                tagPath: ['items', 'name'],
                resolved: true,
            });
        });
    });

    describe('extractBindingsFromElement', () => {
        it('creates layer binding for ref with interactive tag', () => {
            const doc = parse('<button ref="addToCart">Add</button>');
            const el = doc.querySelector('button')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toEqual({
                kind: 'layer',
                binding: {
                    pageContractPath,
                    jayPageSectionId,
                    tagPath: ['addToCart'],
                },
            });
            expect(warnings).toEqual([]);
        });

        it('creates layer binding for text with data tag', () => {
            const doc = parse('<span>{productName}</span>');
            const el = doc.querySelector('span')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toEqual({
                kind: 'layer',
                binding: {
                    pageContractPath,
                    jayPageSectionId,
                    tagPath: ['productName'],
                },
            });
            expect(warnings).toEqual([]);
        });

        it('creates attribute binding for src', () => {
            const doc = parse('<img src="{imageUrl}">');
            const el = doc.querySelector('img')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toEqual({
                kind: 'layer',
                binding: {
                    pageContractPath,
                    jayPageSectionId,
                    tagPath: ['imageUrl'],
                    attribute: 'src',
                },
            });
            expect(warnings).toEqual([]);
        });

        it('creates variant binding for if attribute', () => {
            const doc = parse('<div if="mediaType == IMAGE">content</div>');
            const el = doc.querySelector('div')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]!.kind).toBe('variant');
            if (bindings[0]!.kind === 'variant') {
                expect(bindings[0].binding).toMatchObject({
                    expression: 'mediaType == IMAGE',
                    kind: 'variant-expression',
                    references: [],
                });
                expect((bindings[0].binding as { id: string }).id).toMatch(/^ve-[a-f0-9]{12}$/);
            }
            expect(warnings).toEqual([]);
        });

        it('creates repeater layer binding for forEach with trackBy', () => {
            const doc = parse('<div forEach="items" trackBy="id"><span>{name}</span></div>');
            const el = doc.querySelector('div')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toEqual({
                kind: 'layer',
                binding: {
                    pageContractPath,
                    jayPageSectionId,
                    tagPath: ['items'],
                },
            });
            expect(warnings).toEqual([]);
        });

        it('returns empty bindings for element with no bindings', () => {
            const doc = parse('<div>Static text</div>');
            const el = doc.querySelector('div')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toEqual([]);
            expect(warnings).toEqual([]);
        });

        it('emits warning for unresolvable path', () => {
            const doc = parse('<span>{unknownPath}</span>');
            const el = doc.querySelector('span')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
            );
            expect(bindings).toEqual([]);
            expect(warnings).toContain(
                "BINDING_UNRESOLVED: Could not resolve '{unknownPath}' against contract",
            );
        });

        it('resolves text binding within repeater context', () => {
            const doc = parse('<span>{name}</span>');
            const el = doc.querySelector('span')!;
            const { bindings, warnings } = extractBindingsFromElement(
                el,
                testContractTags,
                jayPageSectionId,
                pageContractPath,
                [['items']],
            );
            expect(bindings).toHaveLength(1);
            expect(bindings[0]).toEqual({
                kind: 'layer',
                binding: {
                    pageContractPath,
                    jayPageSectionId,
                    tagPath: ['items', 'name'],
                },
            });
            expect(warnings).toEqual([]);
        });
    });
});
