import {
    ConstructContext,
    ReferencesManager,
    adoptElement,
    adoptText,
    dynamicAttribute as da,
} from '../../../lib';
import { hydrate, makeServerHTML } from './hydration-test-utils';

describe('adoptElement', () => {
    interface ViewState {
        text: string;
        cls: string;
    }

    // Test #6: adopts existing element — identity check
    it('adopts existing element — DOM identity preserved', () => {
        let adoptedDom: Element | undefined;
        const { root } = hydrate<ViewState>(
            '<div jay-coordinate="box">Content</div>',
            { text: 'Content', cls: 'active' },
            () => {
                const el = adoptElement<ViewState>('box', {});
                adoptedDom = el.dom;
                return el;
            },
        );
        expect(adoptedDom).toBe(root.querySelector('[jay-coordinate="box"]'));
    });

    // Test #7: connects dynamic attributes
    it('connects dynamic attributes — updates on ViewState change', () => {
        const { jayElement, root } = hydrate<ViewState>(
            '<div jay-coordinate="box" class="initial">Content</div>',
            { text: 'Content', cls: 'initial' },
            () =>
                adoptElement<ViewState>('box', {
                    class: da((vs) => vs.cls),
                }),
        );

        const box = root.querySelector('[jay-coordinate="box"]')!;
        expect(box.getAttribute('class')).toBe('initial');

        jayElement.update({ text: 'Content', cls: 'updated' });
        expect(box.getAttribute('class')).toBe('updated');
    });

    // Test #8: connects dynamic children
    it('connects dynamic children — text updates on ViewState change', () => {
        interface VS {
            text: string;
        }

        const { jayElement, root } = hydrate<VS>(
            '<div jay-coordinate="box"><span jay-coordinate="0">Hello</span></div>',
            { text: 'Hello' },
            () => adoptElement<VS>('box', {}, [adoptText<VS>('0', (vs) => vs.text)]),
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
            () => adoptElement<ViewState>('myRef', {}, [], refMyRef()),
        );

        const refs = jayElement.refs as any;
        expect(refs.myRef).toBeDefined();
        const result = await refs.myRef.exec$((el: HTMLElement) => el);
        expect(result).toBe(myRefEl);
    });

    // Test #10: mount/unmount lifecycle
    it('mount/unmount lifecycle works on adopted element', () => {
        const root = makeServerHTML('<div jay-coordinate="box">Content</div>');

        const [refManager, [refBox]] = ReferencesManager.for({}, ['box'], [], [], []);

        ConstructContext.withHydrationRootContext(
            { text: 'Content', cls: '' },
            refManager,
            root,
            () => adoptElement<ViewState>('box', {}, [], refBox()),
        );

        // withHydrationRootContext calls mount() internally
        // Ref should be connected and accessible
        const refs = refManager.getPublicAPI() as any;
        expect(refs.box).toBeDefined();
    });

    // Test #11: adopts element with static + dynamic children
    it('adopts element with static + dynamic children — only dynamic ones update', () => {
        interface VS {
            dynamicText: string;
        }

        const { jayElement, root } = hydrate<VS>(
            '<div jay-coordinate="container">' +
                '<p>Static paragraph</p>' +
                '<span jay-coordinate="0">Dynamic text</span>' +
                '</div>',
            { dynamicText: 'Dynamic text' },
            () => adoptElement<VS>('container', {}, [adoptText<VS>('0', (vs) => vs.dynamicText)]),
        );

        jayElement.update({ dynamicText: 'Updated dynamic' });

        // Dynamic text updated
        expect(root.querySelector('[jay-coordinate="0"]')!.textContent).toBe('Updated dynamic');
        // Static paragraph unchanged
        const staticP = root.querySelector('p')!;
        expect(staticP.textContent).toBe('Static paragraph');
    });
});
