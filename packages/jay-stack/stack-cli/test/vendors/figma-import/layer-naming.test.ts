import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { buildImportIR } from '../../../lib/vendors/figma/jay-html-to-import-ir';

function getFirstChildName(html: string): string {
    const body = parse(`<body>${html}</body>`).querySelector('body')!;
    const ir = buildImportIR(body, '/test', 'test');
    const content = ir.root.children![0];
    return content.name!;
}

describe('Layer naming', () => {
    it('div with class gets tag.class name', () => {
        expect(getFirstChildName('<div class="product-card">text</div>')).toBe('div.product-card');
    });

    it('element with ref keeps ref name', () => {
        expect(getFirstChildName('<div ref="main" class="container">text</div>')).toBe('main');
    });

    it('element with id keeps id name', () => {
        expect(getFirstChildName('<div id="hero" class="banner">text</div>')).toBe('hero');
    });

    it('div without class gets plain tag name', () => {
        expect(getFirstChildName('<div>text</div>')).toBe('div');
    });

    it('display contents div gets (contents) prefix', () => {
        const name = getFirstChildName('<div style="display: contents;"><span>child</span></div>');
        expect(name).toMatch(/^\(contents\)/);
    });

    it('display contents with class gets full name', () => {
        const name = getFirstChildName(
            '<div class="wrapper" style="display: contents;"><span>child</span></div>',
        );
        expect(name).toBe('(contents) div.wrapper');
    });

    it('multi-class element uses first class only', () => {
        expect(getFirstChildName('<div class="card primary large">text</div>')).toBe('div.card');
    });
});
