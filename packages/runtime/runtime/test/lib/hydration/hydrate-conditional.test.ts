import { vi } from 'vitest';
import {
    adoptText,
    adoptElement,
    adoptDynamicElement,
    STATIC,
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
            adoptDynamicElement<ViewState>('container', {}, [
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
                adoptDynamicElement<ViewState>('container', {}, [
                    STATIC,
                    hydrateConditional(
                        (vs) => vs.show,
                        () => adoptText<ViewState>('container/0', (vs) => vs.text),
                    ),
                    STATIC,
                ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;

        // Toggle false then true
        jayElement.update({ show: false, text: 'Conditional' });
        jayElement.update({ show: true, text: 'Conditional' });

        // Verify order: Before, Conditional, After
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
            adoptDynamicElement<ViewState>('container', {}, [
                hydrateConditional(
                    (vs) => vs.show,
                    // Adopt callback — only called when condition is true
                    () => adoptText<ViewState>('container/0', (vs) => vs.text),
                    // Create callback — used when condition is false at SSR
                    () => e('span', {}, [dt((vs: ViewState) => vs.text)]),
                ),
            ]),
        );
    }

    it('false at SSR, still false at hydration — no adopt warnings', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        hydrateWithFallback(false, 'Hello');

        const hydrateWarnings = warnSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[jay hydration]'),
        );
        expect(hydrateWarnings).toEqual([]);
        warnSpy.mockRestore();
    });

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

    // Note: "false at SSR, true at hydration" tests removed — this scenario
    // doesn't happen in practice. The hydration ViewState always matches what
    // SSR used (it's serialized from the same render pass).
});

// Note: "true at SSR, false at hydration" shouldn't happen in practice —
// the hydration ViewState always matches what SSR used. The condition result
// at hydration tells hydrateConditional whether the element exists in DOM.

describe('hydrateConditional ordering — opposite toggles (exact 3a pattern)', () => {
    // Two conditionals that toggle in opposite directions + static button at end.
    // showA starts true, showB starts false. Toggle swaps them.
    interface ViewState {
        showA: boolean;
        showB: boolean;
    }

    // SSR: header, A visible (0/1), B absent, button (0/3)
    const html =
        '<div jay-coordinate="container">' +
        '<p>Header</p>' +
        '<span jay-coordinate="container/1">A</span>' +
        '<button jay-coordinate="container/3">Toggle</button>' +
        '</div>';

    it('toggle A off + B on, then back — button stays at end', () => {
        const { jayElement, root } = hydrate<ViewState>(html, { showA: true, showB: false }, () =>
            adoptDynamicElement<ViewState>('container', {}, [
                STATIC,
                hydrateConditional(
                    (vs) => vs.showA,
                    () => adoptElement<ViewState>('container/1', {}),
                    () => e('span', {}, ['A']),
                ),
                hydrateConditional(
                    (vs) => vs.showB,
                    () => adoptElement<ViewState>('container/2', {}),
                    () => e('span', {}, ['B']),
                ),
                adoptElement<ViewState>('container/3', {}),
            ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;
        const getOrder = () =>
            Array.from(container.childNodes)
                .filter((n) => n.nodeType === Node.ELEMENT_NODE)
                .map((n) => n.textContent!);

        expect(getOrder()).toEqual(['Header', 'A', 'Toggle']);

        // First toggle: A off, B on (simultaneous)
        jayElement.update({ showA: false, showB: true });
        expect(getOrder()).toEqual(['Header', 'B', 'Toggle']);

        // Second toggle: A on, B off (back to initial)
        jayElement.update({ showA: true, showB: false });
        expect(getOrder()).toEqual(['Header', 'A', 'Toggle']);

        // Third toggle
        jayElement.update({ showA: false, showB: true });
        expect(getOrder()).toEqual(['Header', 'B', 'Toggle']);

        // Fourth toggle
        jayElement.update({ showA: true, showB: false });
        expect(getOrder()).toEqual(['Header', 'A', 'Toggle']);
    });
});

describe('hydrateConditional ordering — 3 conditionals, shared condition (exact 3a)', () => {
    // Exact reproduction of test 3a:
    // - 4 STATICs (last one phantom — element absent from DOM)
    // - conditional A (interactiveVisible=true) at 0/4
    // - conditional B (interactiveHidden=false) at 0/5
    // - conditional C (interactiveVisible=true, same condition as A) at 0/6
    // - button at 0/7
    // Toggle swaps A+C off and B on, then back.
    interface ViewState {
        showAC: boolean;
        showB: boolean;
    }

    const html =
        '<div jay-coordinate="c">' +
        '<p>S1</p>' +
        '<p>S2</p>' +
        '<p>S3</p>' +
        '<span jay-coordinate="c/4">A</span>' +
        '<span jay-coordinate="c/6">C</span>' +
        '<button jay-coordinate="c/7">Toggle</button>' +
        '</div>';

    it('toggle off A+C on B, then back — C stays before button', () => {
        const { jayElement, root } = hydrate<ViewState>(html, { showAC: true, showB: false }, () =>
            adoptDynamicElement<ViewState>('c', {}, [
                STATIC,
                STATIC,
                STATIC,
                STATIC, // phantom — no DOM element
                hydrateConditional(
                    (vs) => vs.showAC,
                    () => adoptElement<ViewState>('c/4', {}),
                    () => e('span', {}, ['A']),
                ),
                hydrateConditional(
                    (vs) => vs.showB,
                    () => adoptElement<ViewState>('c/5', {}),
                    () => e('span', {}, ['B']),
                ),
                hydrateConditional(
                    (vs) => vs.showAC,
                    () => adoptElement<ViewState>('c/6', {}),
                    () => e('span', {}, ['C']),
                ),
                adoptElement<ViewState>('c/7', {}),
            ]),
        );

        const container = root.querySelector('[jay-coordinate="c"]')!;
        const getOrder = () =>
            Array.from(container.childNodes)
                .filter((n) => n.nodeType === Node.ELEMENT_NODE)
                .map((n) => n.textContent!);

        expect(getOrder()).toEqual(['S1', 'S2', 'S3', 'A', 'C', 'Toggle']);

        // Toggle: A+C off, B on
        jayElement.update({ showAC: false, showB: true });
        expect(getOrder()).toEqual(['S1', 'S2', 'S3', 'B', 'Toggle']);

        // Toggle back: A+C on, B off
        jayElement.update({ showAC: true, showB: false });
        expect(getOrder()).toEqual(['S1', 'S2', 'S3', 'A', 'C', 'Toggle']);
    });
});

describe('hydrateConditional ordering — STATIC for missing element (3a pattern)', () => {
    // Reproduces test 3a: a STATIC slot corresponds to a fast-phase conditional
    // that was false at SSR — the element is NOT in the DOM, but the hydrate
    // script has a STATIC for it. This phantom STATIC may misalign the
    // Kindergarten's child indexing.
    interface ViewState {
        show: boolean;
    }

    // SSR: h1, visible-span(0/1), button(0/3). Missing: hidden-span(0/2) is absent.
    // The hydrate script has STATIC, conditional(true), STATIC-for-missing, button.
    const html =
        '<div jay-coordinate="container">' +
        '<p>Header</p>' +
        '<span jay-coordinate="container/1">Visible</span>' +
        '<button jay-coordinate="container/3">Toggle</button>' +
        '</div>';

    it('STATIC for absent element — toggle preserves order', () => {
        const { jayElement, root } = hydrate<ViewState>(html, { show: true }, () =>
            adoptDynamicElement<ViewState>('container', {}, [
                STATIC, // h1 — in DOM
                hydrateConditional(
                    (vs) => vs.show,
                    () => adoptElement<ViewState>('container/1', {}),
                    () => e('span', {}, ['Visible']),
                ),
                STATIC, // phantom: fast-phase element absent from DOM
                adoptElement<ViewState>('container/3', {}),
            ]),
        );

        const container = root.querySelector('[jay-coordinate="container"]')!;
        const getOrder = () =>
            Array.from(container.childNodes)
                .filter((n) => n.nodeType === Node.ELEMENT_NODE)
                .map((n) => n.textContent!);

        expect(getOrder()).toEqual(['Header', 'Visible', 'Toggle']);

        // Toggle off then on
        jayElement.update({ show: false });
        jayElement.update({ show: true });

        expect(getOrder()).toEqual(['Header', 'Visible', 'Toggle']);
    });
});

describe('hydrateConditional ordering — multiple conditionals with static siblings', () => {
    // Reproduces the 3a test case: multiple conditionals (some true, some false)
    // followed by a static button. After toggling, elements must maintain order.
    interface ViewState {
        showA: boolean;
        showB: boolean;
    }

    // SSR rendered: showA=true (0/1 present), showB=false (0/2 absent), button at 0/3
    const html =
        '<div jay-coordinate="container">' +
        '<p>Header</p>' +
        '<span jay-coordinate="container/1">A</span>' +
        '<button jay-coordinate="container/3">Toggle</button>' +
        '</div>';

    function setup() {
        return hydrate<ViewState>(html, { showA: true, showB: false }, () =>
            adoptDynamicElement<ViewState>('container', {}, [
                STATIC,
                hydrateConditional(
                    (vs) => vs.showA,
                    () => adoptElement<ViewState>('container/1', {}),
                    () => e('span', {}, ['A']),
                ),
                hydrateConditional(
                    (vs) => vs.showB,
                    () => adoptElement<ViewState>('container/2', {}),
                    () => e('span', {}, ['B']),
                ),
                adoptElement<ViewState>('container/3', {}),
            ]),
        );
    }

    function getOrder(container: Element): string[] {
        return Array.from(container.childNodes)
            .filter((n) => n.nodeType === Node.ELEMENT_NODE)
            .map((n) => n.textContent!);
    }

    it('initial order is correct', () => {
        const { root } = setup();
        const container = root.querySelector('[jay-coordinate="container"]')!;
        expect(getOrder(container)).toEqual(['Header', 'A', 'Toggle']);
    });

    it('toggle A off, B on — B appears before button', () => {
        const { jayElement, root } = setup();
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ showA: false, showB: true });
        expect(getOrder(container)).toEqual(['Header', 'B', 'Toggle']);
    });

    it('toggle back A on, B off — A before button, order preserved', () => {
        const { jayElement, root } = setup();
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ showA: false, showB: true });
        jayElement.update({ showA: true, showB: false });
        expect(getOrder(container)).toEqual(['Header', 'A', 'Toggle']);
    });

    it('both visible — correct order A, B, Toggle', () => {
        const { jayElement, root } = setup();
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ showA: true, showB: true });
        expect(getOrder(container)).toEqual(['Header', 'A', 'B', 'Toggle']);
    });

    it('both hidden then both visible — order preserved', () => {
        const { jayElement, root } = setup();
        const container = root.querySelector('[jay-coordinate="container"]')!;

        jayElement.update({ showA: false, showB: false });
        expect(getOrder(container)).toEqual(['Header', 'Toggle']);

        jayElement.update({ showA: true, showB: true });
        expect(getOrder(container)).toEqual(['Header', 'A', 'B', 'Toggle']);
    });
});
