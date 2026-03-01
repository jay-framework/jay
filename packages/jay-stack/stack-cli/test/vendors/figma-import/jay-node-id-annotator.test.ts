import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { annotateJayNodeIds } from '../../../lib/vendors/figma/jay-node-id-annotator';

describe('annotateJayNodeIds', () => {
    function makeBody(html: string) {
        return parse(html).querySelector('body')!;
    }

    it('assigns position-based IDs to all elements', () => {
        const body = makeBody(
            '<body><div><span>hello</span><p>world</p></div></body>',
        );
        const changed = annotateJayNodeIds(body);

        expect(changed).toBe(true);
        const div = body.querySelector('div')!;
        const span = body.querySelector('span')!;
        const p = body.querySelector('p')!;

        expect(div.getAttribute('data-jay-node-id')).toBe('j-0');
        expect(span.getAttribute('data-jay-node-id')).toBe('j-0-0');
        expect(p.getAttribute('data-jay-node-id')).toBe('j-0-1');
    });

    it('preserves existing IDs', () => {
        const body = makeBody(
            '<body><div data-jay-node-id="custom-id"><span>hello</span></div></body>',
        );
        const changed = annotateJayNodeIds(body);

        expect(changed).toBe(true); // span got a new ID
        const div = body.querySelector('div')!;
        const span = body.querySelector('span')!;

        expect(div.getAttribute('data-jay-node-id')).toBe('custom-id');
        expect(span.getAttribute('data-jay-node-id')).toBe('j-0-0');
    });

    it('returns false when all elements already have IDs', () => {
        const body = makeBody(
            '<body><div data-jay-node-id="j-0"><span data-jay-node-id="j-0-0">hi</span></div></body>',
        );
        const changed = annotateJayNodeIds(body);
        expect(changed).toBe(false);
    });

    it('handles multiple top-level children', () => {
        const body = makeBody(
            '<body><header>h</header><main>m</main><footer>f</footer></body>',
        );
        annotateJayNodeIds(body);

        expect(body.querySelector('header')!.getAttribute('data-jay-node-id')).toBe('j-0');
        expect(body.querySelector('main')!.getAttribute('data-jay-node-id')).toBe('j-1');
        expect(body.querySelector('footer')!.getAttribute('data-jay-node-id')).toBe('j-2');
    });

    it('handles if/forEach elements like any other', () => {
        const body = makeBody(
            `<body>
                <div if="inStock">In Stock</div>
                <div if="!inStock">Out of Stock</div>
                <ul forEach="item in items"><li>{item.name}</li></ul>
            </body>`,
        );
        annotateJayNodeIds(body);

        const divs = body.querySelectorAll('div');
        expect(divs[0].getAttribute('data-jay-node-id')).toBe('j-0');
        expect(divs[1].getAttribute('data-jay-node-id')).toBe('j-1');

        const ul = body.querySelector('ul')!;
        expect(ul.getAttribute('data-jay-node-id')).toBe('j-2');

        const li = body.querySelector('li')!;
        expect(li.getAttribute('data-jay-node-id')).toBe('j-2-0');
    });

    it('handles deeply nested structure', () => {
        const body = makeBody(
            '<body><div><div><div><span>deep</span></div></div></div></body>',
        );
        annotateJayNodeIds(body);

        const span = body.querySelector('span')!;
        expect(span.getAttribute('data-jay-node-id')).toBe('j-0-0-0-0');
    });

    it('produces deterministic IDs across runs', () => {
        const html = '<body><div><span>a</span><p>b</p></div><section>c</section></body>';
        const body1 = makeBody(html);
        const body2 = makeBody(html);

        annotateJayNodeIds(body1);
        annotateJayNodeIds(body2);

        const allIds1 = body1.querySelectorAll('[data-jay-node-id]').map(el => el.getAttribute('data-jay-node-id'));
        const allIds2 = body2.querySelectorAll('[data-jay-node-id]').map(el => el.getAttribute('data-jay-node-id'));

        expect(allIds1).toEqual(allIds2);
    });
});
