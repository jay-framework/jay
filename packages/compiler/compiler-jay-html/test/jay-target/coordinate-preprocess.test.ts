import { describe, it, expect } from 'vitest';
import { parse, HTMLElement } from 'node-html-parser';
import { assignCoordinates } from '../../lib/jay-target/assign-coordinates';

const COORD = 'jay-coordinate-base';
const SCOPE = 'jay-scope';

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
        it('should assign root element coordinate "S0/0"', () => {
            const body = getBody('<body><div><h1>Hello</h1></div></body>');
            assignCoordinates(body, { headlessContractNames: new Set() });

            const root = body.querySelector('div')!;
            expect(root.getAttribute(COORD)).toBe('S0/0');
        });

        it('should assign sequential coordinates to children', () => {
            const body = getBody(`<body><div>
                <h1>Title</h1>
                <p>Content</p>
                <span>Footer</span>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const children = body.querySelector('div')!.querySelectorAll('h1, p, span');
            expect(children[0].getAttribute(COORD)).toBe('S0/0/0');
            expect(children[1].getAttribute(COORD)).toBe('S0/0/1');
            expect(children[2].getAttribute(COORD)).toBe('S0/0/2');
        });

        it('should use positional counter even for elements with refs', () => {
            const body = getBody(`<body><div>
                <button ref="addToCart">Add</button>
                <span>Text</span>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            // Fully positional — ref is ignored for coordinates
            expect(body.querySelector('button')!.getAttribute(COORD)).toBe('S0/0/0');
            expect(body.querySelector('span')!.getAttribute(COORD)).toBe('S0/0/1');
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
            expect(wrapper.getAttribute(COORD)).toBe('S0/0/0');
            expect(wrapper.querySelector('h1')!.getAttribute(COORD)).toBe('S0/0/0/0');
            expect(wrapper.querySelector('p')!.getAttribute(COORD)).toBe('S0/0/0/1');
        });
    });

    describe('headless instances', () => {
        const headlessNames = new Set(['product-card']);

        it('should assign instance coordinate with scope to jay:xxx tag', () => {
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article class="card">
                        <h2>Product</h2>
                    </article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            const jayTag = body.querySelector('jay\\:product-card')!;
            // Instance coordinate in parent scope
            expect(jayTag.getAttribute(COORD)).toBe('S0/0/product-card:0');
            // jay-scope marks the child scope boundary
            expect(jayTag.getAttribute(SCOPE)).toBe('S1');

            // Children are in the child scope S1
            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('S1/0');

            const h2 = jayTag.querySelector('h2')!;
            expect(h2.getAttribute(COORD)).toBe('S1/0/0');
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
            expect(jayTag1.getAttribute(COORD)).toBe('S0/0/product-card:0');
            expect(jayTag2.getAttribute(COORD)).toBe('S0/0/product-card:1');

            // Each instance gets its own child scope
            expect(jayTag1.getAttribute(SCOPE)).toBe('S1');
            expect(jayTag2.getAttribute(SCOPE)).toBe('S2');

            const article1 = jayTag1.querySelector('article')!;
            expect(article1.getAttribute(COORD)).toBe('S1/0');

            const article2 = jayTag2.querySelector('article')!;
            expect(article2.getAttribute(COORD)).toBe('S2/0');
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

            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('S0/0/product-card:hero');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('S1/0');
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

            // Fully positional within child scope S1
            const button = body.querySelector('button')!;
            expect(button.getAttribute(COORD)).toBe('S1/0/1');
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

            expect(body.querySelector('h1')!.getAttribute(COORD)).toBe('S0/0/0');
            // jay:xxx doesn't increment counter
            expect(body.querySelector('p')!.getAttribute(COORD)).toBe('S0/0/1');
        });
    });

    describe('slowForEach', () => {
        it('should create a new scope for each slowForEach item', () => {
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
            // Each item gets its own scope
            expect(items[0].getAttribute(SCOPE)).toBe('S1');
            expect(items[0].getAttribute(COORD)).toBe('S1/0');
            expect(items[1].getAttribute(SCOPE)).toBe('S2');
            expect(items[1].getAttribute(COORD)).toBe('S2/0');

            expect(items[0].querySelector('h2')!.getAttribute(COORD)).toBe('S1/0/0');
            expect(items[1].querySelector('h2')!.getAttribute(COORD)).toBe('S2/0/0');
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

            // slowForEach item scope S1, headless instance scope S2
            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('S1/0/product-card:0');
            expect(jayTag.getAttribute(SCOPE)).toBe('S2');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('S2/0');

            const span = jayTag.querySelector('span')!;
            expect(span.getAttribute(COORD)).toBe('S2/0/0');
        });

        it('should create unique scopes for nested slowForEach', () => {
            const body = getBody(`<body><div>
                <div class="outer" slowForEach="options" trackBy="_id" jayIndex="0" jayTrackBy="opt-A">
                    <div class="inner" slowForEach="choices" trackBy="_id" jayIndex="0" jayTrackBy="choice-1">
                        <button>Select</button>
                    </div>
                    <div class="inner" slowForEach="choices" trackBy="_id" jayIndex="1" jayTrackBy="choice-2">
                        <button>Select</button>
                    </div>
                </div>
                <div class="outer" slowForEach="options" trackBy="_id" jayIndex="1" jayTrackBy="opt-B">
                    <div class="inner" slowForEach="choices" trackBy="_id" jayIndex="0" jayTrackBy="choice-1">
                        <button>Select</button>
                    </div>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const outers = body.querySelectorAll('.outer');
            expect(outers[0].getAttribute(SCOPE)).toBe('S1');
            expect(outers[0].getAttribute(COORD)).toBe('S1/0');
            expect(outers[1].getAttribute(SCOPE)).toBe('S4');
            expect(outers[1].getAttribute(COORD)).toBe('S4/0');

            const inners = body.querySelectorAll('.inner');
            // Each nested slowForEach gets its own scope
            expect(inners[0].getAttribute(SCOPE)).toBe('S2');
            expect(inners[0].getAttribute(COORD)).toBe('S2/0');
            expect(inners[1].getAttribute(SCOPE)).toBe('S3');
            expect(inners[1].getAttribute(COORD)).toBe('S3/0');
            expect(inners[2].getAttribute(SCOPE)).toBe('S5');
            expect(inners[2].getAttribute(COORD)).toBe('S5/0');

            // Children are in their respective item scopes
            const buttons = body.querySelectorAll('button');
            expect(buttons[0].getAttribute(COORD)).toBe('S2/0/0');
            expect(buttons[1].getAttribute(COORD)).toBe('S3/0/0');
            expect(buttons[2].getAttribute(COORD)).toBe('S5/0/0');
        });

        it('should create scopes for nested slowForEach with intermediate elements', () => {
            const body = getBody(`<body><div>
                <div class="outer" slowForEach="options" trackBy="_id" jayIndex="0" jayTrackBy="opt-A">
                    <div class="wrapper">
                        <div class="inner" slowForEach="choices" trackBy="_id" jayIndex="0" jayTrackBy="choice-1">
                            <button>Select</button>
                        </div>
                    </div>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            const outer = body.querySelector('.outer')!;
            expect(outer.getAttribute(SCOPE)).toBe('S1');
            expect(outer.getAttribute(COORD)).toBe('S1/0');

            const wrapper = body.querySelector('.wrapper')!;
            expect(wrapper.getAttribute(COORD)).toBe('S1/0/0');

            // Inner slowForEach gets its own scope
            const inner = body.querySelector('.inner')!;
            expect(inner.getAttribute(SCOPE)).toBe('S2');
            expect(inner.getAttribute(COORD)).toBe('S2/0');

            const button = body.querySelector('button')!;
            expect(button.getAttribute(COORD)).toBe('S2/0/0');
        });
    });

    describe('forEach', () => {
        it('should assign item scope for forEach children', () => {
            const body = getBody(`<body><div>
                <div class="grid" forEach="products" trackBy="_id">
                    <h2>Product</h2>
                    <span>Price</span>
                </div>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: new Set() });

            // forEach container gets parent scope coordinate + item scope
            const forEachEl = body.querySelector('[forEach]')!;
            expect(forEachEl.getAttribute(COORD)).toBe('S0/0/0');
            expect(forEachEl.getAttribute(SCOPE)).toBe('S1');

            // Children are in the item scope S1
            const h2 = forEachEl.querySelector('h2')!;
            expect(h2.getAttribute(COORD)).toBe('S1/0');

            const span = forEachEl.querySelector('span')!;
            expect(span.getAttribute(COORD)).toBe('S1/1');
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

            // forEach item scope S1, headless instance scope S2
            const jayTag = body.querySelector('jay\\:product-card')!;
            expect(jayTag.getAttribute(COORD)).toBe('S1/product-card:0');
            expect(jayTag.getAttribute(SCOPE)).toBe('S2');

            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('S2/0');
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
            // Wrapper is in child scope S1
            expect(wrapper.getAttribute(COORD)).toBe('S1/0');

            expect(wrapper.querySelector('h2')!.getAttribute(COORD)).toBe('S1/0/0');
            expect(wrapper.querySelector('span')!.getAttribute(COORD)).toBe('S1/0/1');
        });

        it('should not wrap single-child inline templates', () => {
            const headlessNames = new Set(['product-card']);
            const body = getBody(`<body><div>
                <jay:product-card productId="123" ref="0">
                    <article><h2>Title</h2><span>Price</span></article>
                </jay:product-card>
            </div></body>`);
            assignCoordinates(body, { headlessContractNames: headlessNames });

            // Should NOT have a wrapper div — article is in child scope S1
            const jayTag = body.querySelector('jay\\:product-card')!;
            const article = jayTag.querySelector('article')!;
            expect(article.getAttribute(COORD)).toBe('S1/0');
        });
    });
});
