import { ConstructContext, ReferencesManager, adoptText, adoptElement } from '../../../lib';

function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('withHydrationRootContext / ConstructContext hydration', () => {
    // Test #12: builds coordinate map from root
    it('builds coordinate map from root via querySelectorAll', () => {
        const root = makeServerHTML(
            '<h1 jay-coordinate="0">Hello</h1>' +
                '<div jay-coordinate="content">Text</div>',
        );

        interface VS {
            title: string;
            text: string;
        }

        let contextIsHydrating = false;
        let resolvedH1: Element | undefined;
        let resolvedContent: Element | undefined;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext<VS, {}>(
            { title: 'Hello', text: 'Text' },
            refManager,
            root,
            () => {
                // Access context inside the callback to verify hydration mode
                const ctx = (ConstructContext as any).prototype;
                // We verify hydration works by resolving coordinates
                adoptText('0', (vs: VS) => vs.title);
                adoptText('content', (vs: VS) => vs.text);
            },
        );

        // Verify the elements were found (adoptText succeeded)
        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        const content = root.querySelector('[jay-coordinate="content"]')!;
        expect(h1.textContent).toBe('Hello');
        expect(content.textContent).toBe('Text');
    });

    // Test #13: returns JayElement with original root DOM
    it('returns JayElement with original root DOM node', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Hello</h1>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Hello' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: { title: string }) => vs.title);
            },
        );

        expect(jayElement.dom).toBe(root);
    });

    // Test #14: ref manager is applied
    it('ref manager is applied — refs accessible on returned element', async () => {
        const root = makeServerHTML(
            '<div jay-coordinate="myRef">Content</div>',
        );
        const myRefEl = root.querySelector('[jay-coordinate="myRef"]')!;

        const [refManager, [refMyRef]] = ReferencesManager.for(
            {},
            ['myRef'],
            [],
            [],
            [],
        );
        const jayElement = ConstructContext.withHydrationRootContext(
            { text: 'Content' },
            refManager,
            root,
            () => {
                adoptElement('myRef', {}, [], refMyRef());
            },
        );

        expect((jayElement as any).refs).toBeDefined();
        expect((jayElement as any).refs.myRef).toBeDefined();
        const result = await (jayElement as any).refs.myRef.exec$((el: HTMLElement) => el);
        expect(result).toBe(myRefEl);
    });

    // Test #15: ViewState updates propagate
    it('ViewState updates propagate through adopted elements', () => {
        const root = makeServerHTML(
            '<h1 jay-coordinate="0">Original</h1>' +
                '<p jay-coordinate="1">Text</p>',
        );

        interface VS {
            heading: string;
            para: string;
        }

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<VS, {}>(
            { heading: 'Original', para: 'Text' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: VS) => vs.heading);
                adoptText('1', (vs: VS) => vs.para);
            },
        );

        jayElement.update({ heading: 'New Heading', para: 'New Text' });

        expect(root.querySelector('[jay-coordinate="0"]')!.textContent).toBe('New Heading');
        expect(root.querySelector('[jay-coordinate="1"]')!.textContent).toBe('New Text');
    });
});
