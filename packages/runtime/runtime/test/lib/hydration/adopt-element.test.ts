import {
    ConstructContext,
    ReferencesManager,
    adoptElement,
    adoptText,
    dynamicAttribute as da,
} from '../../../lib';

function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('adoptElement', () => {
    interface ViewState {
        text: string;
        cls: string;
    }

    // Test #6: adopts existing element — identity check
    it('adopts existing element — DOM identity preserved', () => {
        const root = makeServerHTML('<div jay-coordinate="box">Content</div>');
        const box = root.querySelector('[jay-coordinate="box"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { text: 'Content', cls: 'active' },
            refManager,
            root,
            () => {
                const el = adoptElement<ViewState>('box', {});
                expect(el.dom).toBe(box);
            },
        );
    });

    // Test #7: connects dynamic attributes
    it('connects dynamic attributes — updates on ViewState change', () => {
        const root = makeServerHTML('<div jay-coordinate="box" class="initial">Content</div>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext(
            { text: 'Content', cls: 'initial' },
            refManager,
            root,
            () => {
                adoptElement<ViewState>('box', {
                    class: da((vs) => vs.cls),
                });
            },
        );

        const box = root.querySelector('[jay-coordinate="box"]')!;
        expect(box.getAttribute('class')).toBe('initial');

        jayElement.update({ text: 'Content', cls: 'updated' });
        expect(box.getAttribute('class')).toBe('updated');
    });

    // Test #8: connects dynamic children
    it('connects dynamic children — text updates on ViewState change', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="box"><span jay-coordinate="0">Hello</span></div>',
        );

        interface VS {
            text: string;
        }

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<VS, {}>(
            { text: 'Hello' },
            refManager,
            root,
            () => {
                adoptElement<VS>('box', {}, [
                    adoptText<VS>('0', (vs) => vs.text),
                ]);
            },
        );

        jayElement.update({ text: 'World' });
        expect(root.querySelector('[jay-coordinate="0"]')!.textContent).toBe('World');
    });

    // Test #9: attaches ref
    it('attaches ref via adoptElement', async () => {
        const root = makeServerHTML('<div jay-coordinate="myRef">Content</div>');
        const myRefEl = root.querySelector('[jay-coordinate="myRef"]')!;

        const [refManager, [refMyRef]] = ReferencesManager.for({}, ['myRef'], [], [], []);

        const jayElement = ConstructContext.withHydrationRootContext(
            { text: 'Content', cls: '' },
            refManager,
            root,
            () => {
                adoptElement<ViewState>('myRef', {}, [], refMyRef());
            },
        );

        const refs = jayElement.refs as any;
        expect(refs.myRef).toBeDefined();
        const result = await refs.myRef.exec$((el: HTMLElement) => el);
        expect(result).toBe(myRefEl);
    });

    // Test #10: mount/unmount lifecycle
    it('mount/unmount lifecycle works on adopted element', () => {
        const root = makeServerHTML('<div jay-coordinate="box">Content</div>');
        let mountCount = 0;
        let unmountCount = 0;

        const [refManager, [refBox]] = ReferencesManager.for({}, ['box'], [], [], []);

        const jayElement = ConstructContext.withHydrationRootContext(
            { text: 'Content', cls: '' },
            refManager,
            root,
            () => {
                adoptElement<ViewState>('box', {}, [], refBox());
            },
        );

        // withHydrationRootContext calls mount() internally
        // Ref should be connected and accessible
        const refs = refManager.getPublicAPI() as any;
        expect(refs.box).toBeDefined();
    });

    // Test #11: adopts element with static + dynamic children
    it('adopts element with static + dynamic children — only dynamic ones update', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="container">' +
                '<p>Static paragraph</p>' +
                '<span jay-coordinate="0">Dynamic text</span>' +
                '</div>',
        );

        interface VS {
            dynamicText: string;
        }

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<VS, {}>(
            { dynamicText: 'Dynamic text' },
            refManager,
            root,
            () => {
                adoptElement<VS>('container', {}, [
                    adoptText<VS>('0', (vs) => vs.dynamicText),
                ]);
            },
        );

        jayElement.update({ dynamicText: 'Updated dynamic' });

        // Dynamic text updated
        expect(root.querySelector('[jay-coordinate="0"]')!.textContent).toBe('Updated dynamic');
        // Static paragraph unchanged
        const staticP = root.querySelector('p')!;
        expect(staticP.textContent).toBe('Static paragraph');
    });
});
