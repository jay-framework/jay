import { describe, it, expect } from 'vitest';
import { HTMLElement, NodeType, parse } from 'node-html-parser';
import { prettifyHtml } from '@jay-framework/compiler-shared';
import {
    injectDevMarkers,
    DEV_SRC_ATTR,
    DEV_ITEM_ATTR,
} from '../../lib/jay-target/inject-dev-markers';
import { isDirectiveAttribute } from '../../lib/jay-target/jay-html-compiler-shared';

/** Build a jay-html document from lines so line numbers are explicit (line 1 = first entry). */
function doc(...lines: string[]): string {
    return lines.join('\n');
}

function bodyOf(output: string): HTMLElement {
    return parse(output, {
        comment: true,
        blockTextElements: { script: true, style: true },
    }).querySelector('body')!;
}

function src(el: HTMLElement | null | undefined): string | undefined {
    return el?.getAttribute(DEV_SRC_ATTR);
}

describe('injectDevMarkers', () => {
    describe('jay-dev-src line ranges', () => {
        it('maps single-line and multi-line elements to original file lines', () => {
            const html = doc(
                '<html>', // 1
                '<head><title>t</title></head>', // 2
                '<body>', // 3
                '<main>', // 4
                '  <h1>Hi</h1>', // 5
                '</main>', // 6
                '</body>', // 7
                '</html>', // 8
            );
            const body = bodyOf(injectDevMarkers(html));
            expect(src(body.querySelector('main'))).toBe('4:6');
            expect(src(body.querySelector('h1'))).toBe('5:5');
        });

        it('spans an element whose open tag is split across lines', () => {
            const html = doc(
                '<html>', // 1
                '<body>', // 2
                '<main>', // 3
                '  <button', // 4
                '    ref="x">Go</button>', // 5
                '</main>', // 6
                '</body>', // 7
                '</html>', // 8
            );
            const body = bodyOf(injectDevMarkers(html));
            expect(src(body.querySelector('button'))).toBe('4:5');
        });

        it('gives a parent a range that spans its children', () => {
            const html = doc(
                '<html>', // 1
                '<body>', // 2
                '<main>', // 3
                '  <div>', // 4
                '    <span>a</span>', // 5
                '    <span>b</span>', // 6
                '  </div>', // 7
                '</main>', // 8
                '</body>', // 9
                '</html>', // 10
            );
            const body = bodyOf(injectDevMarkers(html));
            expect(src(body.querySelector('div'))).toBe('4:7');
            const spans = body.querySelectorAll('span');
            expect(src(spans[0])).toBe('5:5');
            expect(src(spans[1])).toBe('6:6');
        });
    });

    describe('scope', () => {
        it('does not mark elements outside <body> (head, jay-data script)', () => {
            const html = doc(
                '<html>',
                '<head>',
                '  <script type="application/jay-data" contract="./page.jay-contract"></script>',
                '  <title>t</title>',
                '</head>',
                '<body><main>x</main></body>',
                '</html>',
            );
            const output = injectDevMarkers(html);
            const root = parse(output, {
                comment: true,
                blockTextElements: { script: true, style: true },
            });
            expect(src(root.querySelector('title'))).toBeFalsy();
            expect(src(root.querySelector('script'))).toBeFalsy();
            expect(src(root.querySelector('main'))).toBeTruthy();
        });

        it('does not mark comments or text nodes', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <!-- a comment -->',
                '  text node',
                '  <span>child</span>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            const main = body.querySelector('main')!;
            const marked = main.childNodes.filter(
                (n) => n.nodeType === NodeType.ELEMENT_NODE,
            ) as HTMLElement[];
            // Only the <span> element is a child element, and it is marked.
            expect(marked).toHaveLength(1);
            expect(src(marked[0])).toBeTruthy();
            const comments = main.childNodes.filter((n) => n.nodeType === NodeType.COMMENT_NODE);
            expect(comments).toHaveLength(1);
        });
    });

    describe('jay-dev-item on forEach item roots', () => {
        it('binds to the trackBy property (lowercase attributes)', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <ul>',
                '    <li foreach="products" trackby="id"><span>{name}</span></li>',
                '  </ul>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            const li = body.querySelector('li')!;
            expect(li.getAttribute(DEV_ITEM_ATTR)).toBe('{id}');
            expect(src(li)).toBeTruthy();
        });

        it('binds to the trackBy property (camelCase attributes)', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <ul forEach="items" trackBy="pid"><li>{name}</li></ul>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            expect(body.querySelector('ul')!.getAttribute(DEV_ITEM_ATTR)).toBe('{pid}');
        });

        it('marks each level of a nested forEach', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <ul foreach="groups" trackby="gid">',
                '    <li foreach="items" trackby="iid"><span>{name}</span></li>',
                '  </ul>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            expect(body.querySelector('ul')!.getAttribute(DEV_ITEM_ATTR)).toBe('{gid}');
            expect(body.querySelector('li')!.getAttribute(DEV_ITEM_ATTR)).toBe('{iid}');
        });

        it('does not add jay-dev-item to non-forEach elements', () => {
            const html = doc('<html>', '<body>', '<main><div>x</div></main>', '</body>', '</html>');
            const body = bodyOf(injectDevMarkers(html));
            expect(body.querySelector('div')!.getAttribute(DEV_ITEM_ATTR)).toBeFalsy();
        });
    });

    describe('regions and conditionals', () => {
        it('marks a region tag with jay-dev-src and leaves its props untouched', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <jay:card title="{p.name}" count="{p.count}">inner</jay:card>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            const card = body.querySelector('jay\\:card')!;
            expect(src(card)).toBe('4:4');
            expect(card.getAttribute(DEV_ITEM_ATTR)).toBeFalsy();
            // Region props stay untouched — the inspector reads them from the source fragment.
            expect(card.getAttribute('title')).toBe('{p.name}');
            expect(card.getAttribute('count')).toBe('{p.count}');
        });

        it('marks a conditional element', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <div if="inStock">available</div>',
                '</main>',
                '</body>',
                '</html>',
            );
            const body = bodyOf(injectDevMarkers(html));
            const div = body.querySelector('div')!;
            expect(src(div)).toBe('4:4');
            expect(div.getAttribute('if')).toBe('inStock');
        });
    });

    describe('preservation and idempotency', () => {
        it('preserves existing attributes', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main><button ref="go" class="primary" data-x="1">Go</button></main>',
                '</body>',
                '</html>',
            );
            const button = bodyOf(injectDevMarkers(html)).querySelector('button')!;
            expect(button.getAttribute('ref')).toBe('go');
            expect(button.getAttribute('class')).toBe('primary');
            expect(button.getAttribute('data-x')).toBe('1');
            expect(src(button)).toBeTruthy();
        });

        it('is idempotent — running twice equals running once', () => {
            const html = doc(
                '<html>',
                '<body>',
                '<main>',
                '  <ul><li foreach="products" trackby="id">{name}</li></ul>',
                '</main>',
                '</body>',
                '</html>',
            );
            const once = injectDevMarkers(html);
            const twice = injectDevMarkers(once);
            expect(prettifyHtml(twice)).toEqual(prettifyHtml(once));
        });
    });

    describe('directive-attribute guard (DL#219)', () => {
        // The markers rely on the compilers' deny-list passthrough: they must NEVER be treated
        // as directives, or they would be stripped from rendered output.
        it('dev markers are not directive attributes', () => {
            expect(isDirectiveAttribute(DEV_SRC_ATTR)).toBe(false);
            expect(isDirectiveAttribute(DEV_ITEM_ATTR)).toBe(false);
        });
    });
});
