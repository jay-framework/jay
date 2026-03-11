import { describe, it, expect } from 'vitest';
import { figmaVendor } from '../../../lib/vendors/figma/index';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

function makeSection(children: FigmaVendorDocument[]): FigmaVendorDocument {
    return {
        id: 'section-1',
        name: 'Test',
        type: 'SECTION',
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        pluginData: { jpage: 'true', urlRoute: '/' },
        children: [
            {
                id: 'frame-1',
                name: 'Content',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 800,
                height: 400,
                layoutMode: 'VERTICAL',
                fills: [],
                children,
            },
        ],
    } as FigmaVendorDocument;
}

const emptyPage = { contractYaml: '', confYaml: '' };

describe('Form Elements Export', () => {
    it('exports <input> as self-closing with stored attributes', async () => {
        const doc = makeSection([
            {
                id: 'input-1',
                name: 'Price Min',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 100,
                height: 40,
                fills: [],
                pluginData: {
                    semanticHtml: 'input',
                    htmlAttributes: JSON.stringify({
                        type: 'number',
                        name: 'priceMin',
                        value: '20',
                        min: '0',
                        max: '1000',
                        placeholder: 'Min price',
                    }),
                },
                children: [],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('<input');
        expect(body).toContain('type="number"');
        expect(body).toContain('name="priceMin"');
        expect(body).toContain('value="20"');
        expect(body).toContain('min="0"');
        expect(body).toContain('max="1000"');
        expect(body).toContain('placeholder="Min price"');
        expect(body).toContain('/>');
    });

    it('exports <select> with <option> children from pluginData', async () => {
        const doc = makeSection([
            {
                id: 'select-1',
                name: 'Sort',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 200,
                height: 40,
                fills: [],
                pluginData: {
                    semanticHtml: 'select',
                    htmlAttributes: JSON.stringify({ name: 'sortBy' }),
                    'jay-select-options': JSON.stringify([
                        { value: 'featured', text: 'Featured', selected: true },
                        { value: 'price-low', text: 'Price: Low to High' },
                        { value: 'newest', text: 'Newest' },
                    ]),
                },
                children: [
                    {
                        id: 'select-text',
                        name: 'Featured',
                        type: 'TEXT',
                        characters: 'Featured',
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 20,
                        fontName: { family: 'Inter', style: 'Regular' },
                        fontSize: 14,
                        fontWeight: 400,
                        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
                    },
                ] as unknown as FigmaVendorDocument[],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('<select');
        expect(body).toContain('name="sortBy"');
        expect(body).toContain('<option value="featured" selected>Featured</option>');
        expect(body).toContain('<option value="price-low">Price: Low to High</option>');
        expect(body).toContain('<option value="newest">Newest</option>');
        expect(body).toContain('</select>');
    });

    it('exports <button> as container with text content', async () => {
        const doc = makeSection([
            {
                id: 'btn-1',
                name: 'Submit',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 120,
                height: 40,
                fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.9 } }],
                pluginData: {
                    semanticHtml: 'button',
                    htmlAttributes: JSON.stringify({ type: 'submit' }),
                },
                children: [
                    {
                        id: 'btn-text',
                        name: 'Search',
                        type: 'TEXT',
                        characters: 'Search',
                        x: 20,
                        y: 10,
                        width: 80,
                        height: 20,
                        fontName: { family: 'Inter', style: 'Medium' },
                        fontSize: 14,
                        fontWeight: 500,
                        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
                    },
                ] as unknown as FigmaVendorDocument[],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('<button');
        expect(body).toContain('type="submit"');
        expect(body).toContain('Search');
        expect(body).toContain('</button>');
    });

    it('exports <a> with href from pluginData', async () => {
        const doc = makeSection([
            {
                id: 'link-1',
                name: 'a',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 100,
                height: 30,
                fills: [],
                pluginData: {
                    semanticHtml: 'a',
                    htmlAttributes: JSON.stringify({
                        href: '/collection',
                        target: '_blank',
                    }),
                },
                children: [
                    {
                        id: 'link-text',
                        name: 'Collection',
                        type: 'TEXT',
                        characters: 'Collection',
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 20,
                        fontName: { family: 'Inter', style: 'Regular' },
                        fontSize: 14,
                        fontWeight: 400,
                        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
                    },
                ] as unknown as FigmaVendorDocument[],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('<a');
        expect(body).toContain('href="/collection"');
        expect(body).toContain('target="_blank"');
        expect(body).toContain('Collection');
        expect(body).toContain('</a>');
    });

    it('exports semantic tags (header, nav, footer) correctly', async () => {
        const doc = makeSection([
            {
                id: 'header-1',
                name: 'header',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 800,
                height: 80,
                layoutMode: 'HORIZONTAL',
                fills: [],
                pluginData: { semanticHtml: 'header' },
                children: [
                    {
                        id: 'nav-1',
                        name: 'nav',
                        type: 'FRAME',
                        x: 600,
                        y: 0,
                        width: 200,
                        height: 80,
                        layoutMode: 'HORIZONTAL',
                        fills: [],
                        pluginData: { semanticHtml: 'nav' },
                        children: [
                            {
                                id: 'nav-text',
                                name: 'Link',
                                type: 'TEXT',
                                characters: 'Home',
                                x: 0,
                                y: 0,
                                width: 50,
                                height: 20,
                                fontName: { family: 'Inter', style: 'Regular' },
                                fontSize: 14,
                                fontWeight: 400,
                                fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
                            },
                        ],
                    },
                ] as unknown as FigmaVendorDocument[],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('<header');
        expect(body).toContain('</header>');
        expect(body).toContain('<nav');
        expect(body).toContain('</nav>');
        expect(body).toContain('Home');
    });
});
