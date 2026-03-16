import { describe, it, expect } from 'vitest';
import { parse, HTMLElement } from 'node-html-parser';
import { assignCoordinates } from '../../lib/jay-target/assign-coordinates';

const COORD = 'jay-coordinate-base';

function getBody(html: string): HTMLElement {
    const root = parse(html);
    return root.querySelector('body')!;
}

/** Collect all jay-coordinate-base attributes from descendants. */
function collectCoordinates(element: HTMLElement): Record<string, string> {
    const result: Record<string, string> = {};

    function walk(el: HTMLElement, path: string) {
        const coord = el.getAttribute(COORD);
        if (coord) {
            result[path] = coord;
        }
        let childIndex = 0;
        for (const child of el.childNodes) {
            if (child.nodeType === 1) {
                const childEl = child as HTMLElement;
                const tag = childEl.tagName?.toLowerCase() || 'unknown';
                const ref = childEl.getAttribute('ref');
                const id = ref ? `${tag}[ref=${ref}]` : `${tag}:${childIndex}`;
                walk(childEl, path ? `${path} > ${id}` : id);
                childIndex++;
            }
        }
    }

    walk(element, '');
    return result;
}

describe('assignCoordinates', () => {
    describe('basic elements', () => {
        it('should assign root element coordinate "0"', () => {
            const body = getBody('<body><div><h1>Hello</h1></div></body>');
            assignCoordinates(body, { headlessContractNames: new Set() });

            const root = body.querySelector('div')!;
            expect(root.getAttribute(COORD)).toBe('0');
        });

        it('should assign sequential coordinates to children', () => {
            const body = getBody(`<body><div>
                <h1>Title</h1>
                <p>Content</p>
                <span>Footer</span>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const children = body.querySelector('div')!.querySelectorAll('h1, p, span');
            expect(children[0].getAttribute(COORD)).toBe('0/0');
            expect(children[1].getAttribute(COORD)).toBe('0/1');
            expect(children[2].getAttribute(COORD)).toBe('0/2');
        });

        it('should use positional counter even for elements with refs', () => {
            const body = getBody(`<body><div>
                <button ref="addToCart">Add</button>
                <span>Text</span>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            // Fully positional — ref is ignored for coordinates
            expect(body.querySelector('button')!.getAttribute(COORD)).toBe('0/0');
            expect(body.querySelector('span')!.getAttribute(COORD)).toBe('0/1');
        });

        it('should handle nested elements', () => {
            const body = getBody(`<body><div>
                <div class="wrapper">
                    <h1>Title</h1>
                    <p>Content</p>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const wrapper = body.querySelector('.wrapper')!;
            expect(wrapper.getAttribute(COORD)).toBe('0/0');
            expect(wrapper.querySelector('h1')!.getAttribute(COORD)).toBe('0/0/0');
            expect(wrapper.querySelector('p')!.getAttribute(COORD)).toBe('0/0/1');
        });
    });

    describe('headless instances', () => {
        const headlessNames = new Set(['product-card']);

        it('should assign instance coordinate to jay:xxx tag', () => {
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article class="card">
                        <h2>Product</h2>
                    </article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('0/product-card:0');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('0/product-card:0/0');

            const h2 = jayTag.querySelector('h2')!;
            expect(h2.getAttribute(COORD)).toBe('0/product-card:0/0/0');
        });

        it('should assign unique coordinates to two consecutive jay:xxx tags', () => {
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article class="card">
                        <h2>Product A</h2>
                    </article>
                </jay:product-card>
                <jay:product-card productId="456" ref="1">
                    <article class="card">
                        <h2>Product B</h2>
                    </article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            const [jayTag1, jayTag2] = body.querySelectorAll('jay\\:product-card')!;
            // Uses per-scope counter, not ref attribute — always unique
            expect(jayTag1.getAttribute(COORD)).toBe('0/product-card:0');
            expect(jayTag2.getAttribute(COORD)).toBe('0/product-card:1');

            const article1 = jayTag1.querySelector('article')!;
            expect(article1.getAttribute(COORD)).toBe('0/product-card:0/0');

            const article2 = jayTag2.querySelector('article')!;
            expect(article2.getAttribute(COORD)).toBe('0/product-card:1/0');
        });

        it('should use ref attribute for coordinate suffix', () => {
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="hero">
                    <article class="card">
                        <span class="price">$10</span>
                    </article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            // Coordinate uses ref attribute, not a counter
            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('0/product-card:hero');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('0/product-card:hero/0');
        });

        it('should use positional counter for inline template refs', () => {
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article class="card">
                        <h2>Product</h2>
                        <button ref="addToCart">Add</button>
                    </article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            // Fully positional — ref="addToCart" gets counter-based coordinate
            const button = body.querySelector('button')!;
            expect(button.getAttribute(COORD)).toBe('0/product-card:0/0/1');
        });

        it('should not increment parent counter for jay:xxx tags', () => {
            const body = getBody(`<body><div>
                <h1>Title</h1>
                <jay:product-card productId="123" ref="0">
                    <article>Product</article>
                </jay:product-card>
                <p>After</p>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            expect(body.querySelector('h1')!.getAttribute(COORD)).toBe('0/0');
            // jay:xxx doesn't increment counter
            expect(body.querySelector('p')!.getAttribute(COORD)).toBe('0/1');
        });
    });

    describe('slowForEach', () => {
        it('should use jayTrackBy as coordinate', () => {
            const body = getBody(`<body><div>
                <div class="grid">
                    <div slowForEach="products" trackBy="_id" jayIndex="0" jayTrackBy="p1">
                        <h2>Product A</h2>
                    </div>
                    <div slowForEach="products" trackBy="_id" jayIndex="1" jayTrackBy="p2">
                        <h2>Product B</h2>
                    </div>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const items = body.querySelectorAll('[slowForEach]');
            expect(items[0].getAttribute(COORD)).toBe('p1');
            expect(items[1].getAttribute(COORD)).toBe('p2');

            expect(items[0].querySelector('h2')!.getAttribute(COORD)).toBe('p1/0');
            expect(items[1].querySelector('h2')!.getAttribute(COORD)).toBe('p2/0');
        });

        it('should handle headless instance inside slowForEach', () => {
            const headlessNames = new Set(['product-card']);
            const body = getBody(`<body><div>
                <div class="grid">
                    <div slowForEach="products" trackBy="_id" jayIndex="0" jayTrackBy="p1">
                        <jay:product-card productId="prod-a" ref="0">
                            <article>
                                <span class="price">$10</span>
                            </article>
                        </jay:product-card>
                    </div>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('p1/product-card:0');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('p1/product-card:0/0');

            const span = jayTag.querySelector('span')!;
            expect(span.getAttribute(COORD)).toBe('p1/product-card:0/0/0');
        });
    });

    describe('forEach', () => {
        it('should use $trackBy placeholder for item coordinates', () => {
            const body = getBody(`<body><div>
                <div class="grid" forEach="products" trackBy="_id">
                    <h2>Product</h2>
                    <span>Price</span>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const forEachEl = body.querySelector('[forEach]')!;
            expect(forEachEl.getAttribute(COORD)).toBe('0/0');

            const h2 = forEachEl.querySelector('h2')!;
            expect(h2.getAttribute(COORD)).toBe('$_id/0');

            const span = forEachEl.querySelector('span')!;
            expect(span.getAttribute(COORD)).toBe('$_id/1');
        });

        it('should handle headless instance inside forEach', () => {
            const headlessNames = new Set(['product-card']);
            const body = getBody(`<body><div>
                <div class="grid" forEach="products" trackBy="_id">
                    <jay:product-card productId="123" ref="0">
                        <article>
                            <h2>Product</h2>
                        </article>
                    </jay:product-card>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('$_id/product-card:0');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('$_id/product-card:0/0');
        });
    });

    describe('multi-child wrapper normalization', () => {
        it('should wrap multi-child headless inline templates for non-slow pages', () => {
            const headlessNames = new Set(['product-card']);
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <h2>Title</h2>
                    <span>Price</span>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            // Should have wrapped the children in a <div>
            const jayTag = body.querySelector('jay\\:product-card')!;
            const wrapper = jayTag.querySelector('div')!;
            expect(wrapper).toBeTruthy();
            expect(wrapper.getAttribute(COORD)).toBe('0/product-card:0/0');

            expect(wrapper.querySelector('h2')!.getAttribute(COORD)).toBe('0/product-card:0/0/0');
            expect(wrapper.querySelector('span')!.getAttribute(COORD)).toBe('0/product-card:0/0/1');
        });

        it('should not wrap single-child inline templates', () => {
            const headlessNames = new Set(['product-card']);
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article><h2>Title</h2><span>Price</span></article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            // Should NOT have a wrapper div
            const jayTag = body.querySelector('jay\\:product-card')!;
            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('0/product-card:0/0');
        });
    });
});
