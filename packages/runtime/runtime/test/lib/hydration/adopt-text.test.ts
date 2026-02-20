import { ConstructContext, ReferencesManager, adoptText } from '../../../lib';

function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('adoptText', () => {
    interface ViewState {
        title: string;
    }

    // Test #1: adopts existing text node
    it('adopts existing text node — node identity preserved', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Hello World</h1>');
        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        const originalTextNode = h1.firstChild!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Hello World' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: ViewState) => vs.title);
            },
        );

        // Text node should be the same object (not recreated)
        expect(h1.firstChild).toBe(originalTextNode);
        expect(h1.textContent).toBe('Hello World');
        // Root element should be preserved
        expect(jayElement.dom).toBe(root);
    });

    // Test #2: updates text on ViewState change
    it('updates text on ViewState change', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Hello</h1>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Hello' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: ViewState) => vs.title);
            },
        );

        jayElement.update({ title: 'Updated' });

        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        expect(h1.textContent).toBe('Updated');
    });

    // Test #3: handles empty string — update to empty replaces server text
    it('handles empty string — update to empty replaces server text', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Initial</h1>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Initial' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: ViewState) => vs.title);
            },
        );

        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        // Update to empty string should clear the text
        jayElement.update({ title: '' });
        expect(h1.textContent).toBe('');
    });

    // Test #4: handles special characters
    it('handles special characters — no double escaping', () => {
        const root = makeServerHTML(
            '<h1 jay-coordinate="0">&lt;script&gt;alert&lt;/script&gt;</h1>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { title: '<script>alert</script>' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: ViewState) => vs.title);
            },
        );

        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        // textContent is the unescaped version (DOM handles entities)
        expect(h1.textContent).toBe('<script>alert</script>');
    });

    // Test #5: works with ref binding
    it('works with ref binding', async () => {
        const root = makeServerHTML('<div jay-coordinate="content">Some text</div>');
        const contentEl = root.querySelector('[jay-coordinate="content"]')!;

        const [refManager, [refContent]] = ReferencesManager.for(
            {},
            ['content'],
            [],
            [],
            [],
        );
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Some text' },
            refManager,
            root,
            () => {
                adoptText('content', (vs: ViewState) => vs.title, refContent());
            },
        );

        const refs = jayElement.refs as any;
        expect(refs.content).toBeDefined();
        // Use exec$ to verify the ref points to the correct element
        const result = await refs.content.exec$((el: HTMLElement) => el);
        expect(result).toBe(contentEl);
    });

    // Additional: skips-on-same-value optimization
    it('does not touch DOM when value unchanged', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Hello</h1>');
        const h1 = root.querySelector('[jay-coordinate="0"]')!;
        const textNode = h1.firstChild as Text;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { title: 'Hello' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: ViewState) => vs.title);
            },
        );

        // Spy on textContent setter
        const originalTextContent = textNode.textContent;
        let setterCalled = false;
        const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
        Object.defineProperty(textNode, 'textContent', {
            get: () => descriptor.get!.call(textNode),
            set: (val) => {
                setterCalled = true;
                descriptor.set!.call(textNode, val);
            },
            configurable: true,
        });

        jayElement.update({ title: 'Hello' }); // same value
        expect(setterCalled).toBe(false);

        jayElement.update({ title: 'Changed' }); // different value
        expect(setterCalled).toBe(true);

        // Cleanup
        Object.defineProperty(textNode, 'textContent', descriptor);
    });

    // Multiple adoptText calls in single hydration
    it('multiple adoptText calls in single hydration', () => {
        const root = makeServerHTML(
            '<div>' +
                '<h1 jay-coordinate="0">Title</h1>' +
                '<p jay-coordinate="1">Subtitle</p>' +
                '</div>',
        );

        interface MultiVS {
            heading: string;
            subtitle: string;
        }

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<MultiVS, {}>(
            { heading: 'Title', subtitle: 'Subtitle' },
            refManager,
            root,
            () => {
                adoptText('0', (vs: MultiVS) => vs.heading);
                adoptText('1', (vs: MultiVS) => vs.subtitle);
            },
        );

        jayElement.update({ heading: 'New Title', subtitle: 'New Sub' });

        expect(root.querySelector('[jay-coordinate="0"]')!.textContent).toBe('New Title');
        expect(root.querySelector('[jay-coordinate="1"]')!.textContent).toBe('New Sub');
    });
});
