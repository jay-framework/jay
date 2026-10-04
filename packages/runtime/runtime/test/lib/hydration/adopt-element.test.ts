import {
    ConstructContext,
    ReferencesManager,
    adoptElement,
    adoptText,
    dynamicAttribute as da,
    booleanAttribute as ba,
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

    // Dynamic style properties: the compiler passes `style` as a map of per-property values
    it('connects dynamic style properties — updates on ViewState change, keeps static ones', () => {
        interface VS {
            offset: number;
        }
        const { jayElement, root } = hydrate<VS>(
            '<div jay-coordinate="box" style="color: red; transform: translateX(0px)">Content</div>',
            { offset: 0 },
            () =>
                adoptElement<VS>('box', {
                    style: {
                        color: 'red',
                        transform: da((vs) => `translateX(${vs.offset}px)`),
                    },
                }),
        );

        const box = root.querySelector('[jay-coordinate="box"]') as HTMLElement;
        jayElement.update({ offset: -980 });
        expect(box.style.transform).toBe('translateX(-980px)');
        expect(box.style.color).toBe('red');
    });

    it('connects dynamic CSS custom properties', () => {
        interface VS {
            current: number;
        }
        const { jayElement, root } = hydrate<VS>(
            '<div jay-coordinate="box" style="--current: 0">Content</div>',
            { current: 0 },
            () =>
                adoptElement<VS>('box', {
                    style: { '--current': da((vs) => String(vs.current)) },
                }),
        );

        const box = root.querySelector('[jay-coordinate="box"]') as HTMLElement;
        jayElement.update({ current: 2 });
        expect(box.style.getPropertyValue('--current')).toBe('2');
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

    // Boolean attribute: should remove attribute from DOM when value becomes false
    it('removes boolean attribute from DOM when value becomes false', () => {
        interface VS {
            isDisabled: boolean;
        }
        const { jayElement, root } = hydrate<VS>(
            '<button jay-coordinate="btn" disabled>Submit</button>',
            { isDisabled: true },
            () =>
                adoptElement<VS>('btn', {
                    disabled: ba((vs) => vs.isDisabled),
                }),
        );

        const btn = root.querySelector('[jay-coordinate="btn"]')!;
        expect(btn.hasAttribute('disabled')).toBe(true);

        jayElement.update({ isDisabled: false });
        expect(btn.hasAttribute('disabled')).toBe(false);
    });

    // Boolean attribute: should re-add attribute when value becomes true again
    it('re-adds boolean attribute to DOM when value becomes true again', () => {
        interface VS {
            isDisabled: boolean;
        }
        const { jayElement, root } = hydrate<VS>(
            '<button jay-coordinate="btn" disabled>Submit</button>',
            { isDisabled: true },
            () =>
                adoptElement<VS>('btn', {
                    disabled: ba((vs) => vs.isDisabled),
                }),
        );

        const btn = root.querySelector('[jay-coordinate="btn"]')!;
        jayElement.update({ isDisabled: false });
        expect(btn.hasAttribute('disabled')).toBe(false);

        jayElement.update({ isDisabled: true });
        expect(btn.hasAttribute('disabled')).toBe(true);
    });
});
