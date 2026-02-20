import { ConstructContext, ReferencesManager, adoptText, adoptElement } from '../../../lib';
import { hydrate, makeServerHTML } from './hydration-test-utils';

describe('withHydrationRootContext / ConstructContext hydration', () => {
    // Test #12: builds coordinate map from root
    it('builds coordinate map from root via querySelectorAll', () => {
        interface VS {
            title: string;
            text: string;
        }

        const { root } = hydrate<VS>(
            '<h1 jay-coordinate="0">Hello</h1>' +
                '<div jay-coordinate="content">Text</div>',
            { title: 'Hello', text: 'Text' },
            () => {
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
        const { jayElement, root } = hydrate(
            '<h1 jay-coordinate="0">Hello</h1>',
            { title: 'Hello' },
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
        interface VS {
            heading: string;
            para: string;
        }

        const { jayElement, root } = hydrate<VS>(
            '<h1 jay-coordinate="0">Original</h1>' +
                '<p jay-coordinate="1">Text</p>',
            { heading: 'Original', para: 'Text' },
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