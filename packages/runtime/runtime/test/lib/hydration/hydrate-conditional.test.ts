import {
    adoptText,
    adoptElement,
    hydrateConditional,
    element as e,
    dynamicText as dt,
} from '../../../lib';
import { hydrate } from './hydration-test-utils';

describe('hydrateConditional (if=true at SSR)', () => {
    interface ViewState {
        show: boolean;
        text: string;
    }

    const conditionalHTML =
        '<div jay-coordinate="container">' +
        '<span jay-coordinate="container/0">$TEXT</span>' +
        '</div>';

    function hydrateConditionalTest(text: string, show: boolean) {
        return hydrate<ViewState>(conditionalHTML.replace('$TEXT', text), { show, text }, () =>
            adoptElement<ViewState>('container', {}, [
                hydrateConditional(
                    (vs) => vs.show,
                    () => adoptText<ViewState>('container/0', (vs) => vs.text),
                ),
            ]),
        );
    }

    // Test #16: adopts existing element when condition=true
    it('adopts existing element when condition=true — node identity preserved', () => {
        const { root } = hydrateConditionalTest('Visible', true);

        const span = root.querySelector('[jay-coordinate="container/0"]')!;
        expect(span).toBeTruthy();
        expect(span.textContent).toBe('Visible');
    });

    // Test #17: hides element when condition toggles to false
    it('hides element when condition toggles to false', () => {
        const { jayElement, root } = hydrateConditionalTest('Visible', true);
        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Initially visible
        expect(container.querySelector('[jay-coordinate="container/0"]')).toBeTruthy();

        // Toggle to false
        jayElement.update({ show: false, text: 'Visible' });

        // Element should be removed from the container
        expect(container.querySelector('[jay-coordinate="container/0"]')).toBeNull();
    });

    // Test #18: shows element when condition toggles back to true
    it('shows element when condition toggles back to true — same node', () => {
        const { jayElement, root } = hydrateConditionalTest('Visible', true);
        const span = root.querySelector('[jay-coordinate="container/0"]')!;
        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Toggle false then true
        jayElement.update({ show: false, text: 'Visible' });
        jayElement.update({ show: true, text: 'Visible' });

        // Same node reappears
        const reappeared = container.querySelector('[jay-coordinate="container/0"]')!;
        expect(reappeared).toBe(span);
    });

    // Test #19: dynamic content updates while visible
    it('dynamic content updates while visible', () => {
        const { jayElement, root } = hydrateConditionalTest('Initial', true);

        jayElement.update({ show: true, text: 'Updated' });

        const span = root.querySelector('[jay-coordinate="container/0"]')!;
        expect(span.textContent).toBe('Updated');
    });

    // Test #20: conditional with static siblings — position preserved
    it('conditional with static siblings — position preserved after toggle', () => {
        const { jayElement, root } = hydrate<ViewState>(
            '<div jay-coordinate="container">' +
                '<p>Before</p>' +
                '<span jay-coordinate="container/0">Conditional</span>' +
                '<p>After</p>' +
                '</div>',
            { show: true, text: 'Conditional' },
            () =>
                adoptElement<ViewState>('container', {}, [
                    hydrateConditional(
                        (vs) => vs.show,
                        () => adoptText<ViewState>('container/0', (vs) => vs.text),
                    ),
                ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Toggle false then true
        jayElement.update({ show: false, text: 'Conditional' });
        jayElement.update({ show: true, text: 'Conditional' });

        // Verify order: Before, Conditional, [comment], After
        const children = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        expect(children[0].textContent).toBe('Before');
        expect(children[1].textContent).toBe('Conditional');
        expect(children[2].textContent).toBe('After');
    });

    // Test #21: Kindergarten group starts empty (size=0) for if=false at SSR
    // Note: if=false at SSR uses regular conditional() — no hydrateConditional needed.
    // This test just verifies that the existing conditional() works in hydration mode.
    it('if=false at SSR — uses regular conditional, element created on first true', () => {
        interface CondVS {
            show: boolean;
        }

        const { root } = hydrate<CondVS>(
            '<div jay-coordinate="container"></div>',
            { show: false },
            () =>
                // For if=false at SSR, the compiled code would use the regular
                // adoptElement with no conditional children (since nothing was rendered).
                // When the condition becomes true, it needs full element creation.
                // This is handled by the compiler generating both adopt and create paths.
                adoptElement<CondVS>('container', {}),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;
        // Container starts empty (if=false)
        expect(container.children.length).toBe(0);
    });
});

describe('hydrateConditional with createFallback (if=false at SSR)', () => {
    interface ViewState {
        show: boolean;
        text: string;
    }

    // SSR rendered WITHOUT the conditional element (condition was false)
    const emptyContainerHTML = '<div jay-coordinate="container"></div>';

    function hydrateWithFallback(show: boolean, text: string) {
        return hydrate<ViewState>(emptyContainerHTML, { show, text }, () =>
            adoptElement<ViewState>('container', {}, [
                hydrateConditional(
                    (vs) => vs.show,
                    // Adopt callback — will fail since element not in DOM
                    () => adoptText<ViewState>('container/0', (vs) => vs.text),
                    // Create callback — fallback for false-at-SSR
                    () => e('span', {}, [dt((vs: ViewState) => vs.text)]),
                ),
            ]),
        );
    }

    it('false at SSR, still false at hydration — element not created', () => {
        const { root } = hydrateWithFallback(false, 'Hello');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        // No span created, only the comment anchor
        expect(container.querySelector('span')).toBeNull();
    });

    it('false at SSR, still false, then toggled true — element created via fallback', () => {
        const { jayElement, root } = hydrateWithFallback(false, 'Hello');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Initially no span
        expect(container.querySelector('span')).toBeNull();

        // Toggle to true
        jayElement.update({ show: true, text: 'Hello' });

        // Element created
        const span = container.querySelector('span')!;
        expect(span).toBeTruthy();
        expect(span.textContent).toBe('Hello');
    });

    it('false at SSR, toggled true, then false — element removed', () => {
        const { jayElement, root } = hydrateWithFallback(false, 'Hello');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ show: true, text: 'Hello' });
        expect(container.querySelector('span')).toBeTruthy();

        jayElement.update({ show: false, text: 'Hello' });
        expect(container.querySelector('span')).toBeNull();
    });

    it('false at SSR, toggled true→false→true — same element re-inserted', () => {
        const { jayElement, root } = hydrateWithFallback(false, 'Hello');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ show: true, text: 'Hello' });
        const span = container.querySelector('span')!;

        jayElement.update({ show: false, text: 'Hello' });
        jayElement.update({ show: true, text: 'Hello' });

        // Same node re-inserted
        expect(container.querySelector('span')).toBe(span);
    });

    it('false at SSR, toggled true — dynamic content updates', () => {
        const { jayElement, root } = hydrateWithFallback(false, 'Initial');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ show: true, text: 'Initial' });
        expect(container.querySelector('span')!.textContent).toBe('Initial');

        jayElement.update({ show: true, text: 'Updated' });
        expect(container.querySelector('span')!.textContent).toBe('Updated');
    });

    it('false at SSR, but true at hydration — element created immediately', () => {
        // ViewState says show=true (data changed between SSR and hydration)
        const { root } = hydrateWithFallback(true, 'Already visible');
        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Element should exist immediately (created during construction)
        const span = container.querySelector('span')!;
        expect(span).toBeTruthy();
        expect(span.textContent).toBe('Already visible');
    });

    it('false at SSR, true at hydration — can toggle off and on', () => {
        const { jayElement, root } = hydrateWithFallback(true, 'Hello');
        const container = root.querySelector('[jay-coordinate="container"]')!;
        const span = container.querySelector('span')!;
        expect(span).toBeTruthy();

        // Toggle off
        jayElement.update({ show: false, text: 'Hello' });
        expect(container.querySelector('span')).toBeNull();

        // Toggle back on
        jayElement.update({ show: true, text: 'Hello' });
        expect(container.querySelector('span')).toBe(span);
    });
});

describe('hydrateConditional true at SSR, false at hydration', () => {
    interface ViewState {
        show: boolean;
        text: string;
    }

    // SSR rendered WITH the conditional element (condition was true)
    const withElementHTML =
        '<div jay-coordinate="container">' +
        '<span jay-coordinate="container/0">ServerText</span>' +
        '</div>';

    it('true at SSR, false at hydration — element adopted then removed on first update', () => {
        // SSR had show=true (element in DOM), but hydration state has show=false
        const { jayElement, root } = hydrate<ViewState>(
            withElementHTML,
            { show: false, text: 'ServerText' },
            () =>
                adoptElement<ViewState>('container', {}, [
                    hydrateConditional(
                        (vs) => vs.show,
                        () => adoptText<ViewState>('container/0', (vs) => vs.text),
                        () => e('span', {}, [dt((vs: ViewState) => vs.text)]),
                    ),
                ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Element was adopted (exists in DOM from SSR)
        expect(container.querySelector('[jay-coordinate="container/0"]')).toBeTruthy();

        // First update with show=false removes it
        jayElement.update({ show: false, text: 'ServerText' });
        expect(container.querySelector('[jay-coordinate="container/0"]')).toBeNull();
    });

    it('true at SSR, false at hydration — can toggle back to true (same node)', () => {
        const { jayElement, root } = hydrate<ViewState>(
            withElementHTML,
            { show: false, text: 'ServerText' },
            () =>
                adoptElement<ViewState>('container', {}, [
                    hydrateConditional(
                        (vs) => vs.show,
                        () => adoptText<ViewState>('container/0', (vs) => vs.text),
                        () => e('span', {}, [dt((vs: ViewState) => vs.text)]),
                    ),
                ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;
        const span = container.querySelector('[jay-coordinate="container/0"]')!;

        // Remove then re-add
        jayElement.update({ show: false, text: 'ServerText' });
        jayElement.update({ show: true, text: 'Updated' });

        // Same node re-inserted with updated text
        const reappeared = container.querySelector('[jay-coordinate="container/0"]')!;
        expect(reappeared).toBe(span);
        expect(reappeared.textContent).toBe('Updated');
    });
});
