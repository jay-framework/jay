import {
    ConstructContext,
    ReferencesManager,
    adoptText,
    currentConstructionContext,
    withContext,
    element as e,
} from '../../../lib';
import { CONSTRUCTION_CONTEXT_MARKER } from '../../../lib/context';

function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('coordinate resolution', () => {
    // Test #34: finds element by ref coordinate
    it('finds element by ref coordinate', () => {
        const root = makeServerHTML('<div jay-coordinate="content">Text</div>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { text: 'Text' },
            refManager,
            root,
            () => {
                const el = adoptText('content', (vs: { text: string }) => vs.text);
                expect(el.dom).toBe(root.querySelector('[jay-coordinate="content"]'));
            },
        );
    });

    // Test #35: finds element by auto-index
    it('finds element by auto-index coordinate', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Title</h1>');

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { title: 'Title' },
            refManager,
            root,
            () => {
                const el = adoptText('0', (vs: { title: string }) => vs.title);
                expect(el.dom).toBe(root.querySelector('[jay-coordinate="0"]'));
            },
        );
    });

    // Test #36: finds element in forEach scope
    it('finds element in forEach scope via forItem context', () => {
        const root = makeServerHTML(
            '<li jay-coordinate="item-1">' +
                '<span jay-coordinate="item-1/name">Widget</span>' +
                '</li>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { items: [{ id: 'item-1', name: 'Widget' }] },
            refManager,
            root,
            () => {
                // Simulate forEach item scoping: forItem creates a child context
                // with coordinateBase ["item-1"]
                const ctx = currentConstructionContext();
                const childCtx = ctx.forItem({ id: 'item-1', name: 'Widget' }, 'item-1');
                withContext(CONSTRUCTION_CONTEXT_MARKER, childCtx, () => {
                    const el = adoptText('name', (vs: { name: string }) => vs.name);
                    expect(el.dom).toBe(
                        root.querySelector('[jay-coordinate="item-1/name"]'),
                    );
                });
            },
        );
    });

    // Test #37: finds element in nested forEach
    it('finds element in nested forEach via chained forItem contexts', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="parent-1/child-2/label">Nested</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            {},
            refManager,
            root,
            () => {
                const ctx = currentConstructionContext();
                const parentCtx = ctx.forItem({}, 'parent-1');
                withContext(CONSTRUCTION_CONTEXT_MARKER, parentCtx, () => {
                    const childCtx = currentConstructionContext().forItem({}, 'child-2');
                    withContext(CONSTRUCTION_CONTEXT_MARKER, childCtx, () => {
                        const el = adoptText('label', (vs: any) => 'Nested');
                        expect(el.dom).toBe(
                            root.querySelector(
                                '[jay-coordinate="parent-1/child-2/label"]',
                            ),
                        );
                    });
                });
            },
        );
    });

    // Test #38: handles missing coordinate gracefully
    it('handles missing coordinate gracefully — warns in dev mode, does not throw', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Title</h1>');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            { text: 'hello' },
            refManager,
            root,
            () => {
                // Try to adopt a coordinate that doesn't exist
                const el = adoptText('nonexistent', (vs: any) => vs.text);
                // Should not throw, returns a noop element
                expect(el.dom).toBeUndefined();
            },
        );

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('nonexistent'),
        );
        warnSpy.mockRestore();
    });

    // Verify isHydrating is true inside hydration context
    it('isHydrating returns true inside withHydrationRootContext', () => {
        const root = makeServerHTML('<h1 jay-coordinate="0">Test</h1>');

        let wasHydrating = false;
        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            {},
            refManager,
            root,
            () => {
                wasHydrating = currentConstructionContext().isHydrating;
            },
        );

        expect(wasHydrating).toBe(true);
    });

    // Verify isHydrating is false in normal context
    it('isHydrating returns false in normal withRootContext', () => {
        const [rm] = ReferencesManager.for({}, [], [], [], []);
        let wasHydrating = true;
        ConstructContext.withRootContext({}, rm, () => {
            wasHydrating = currentConstructionContext().isHydrating;
            return e('div', {});
        });

        expect(wasHydrating).toBe(false);
    });

    // Verify forItem propagates coordinateMap
    it('forItem propagates coordinateMap to child context', () => {
        const root = makeServerHTML(
            '<span jay-coordinate="item-1/0">Child Text</span>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext(
            {},
            refManager,
            root,
            () => {
                const ctx = currentConstructionContext();
                expect(ctx.isHydrating).toBe(true);
                const childCtx = ctx.forItem({}, 'item-1');
                expect(childCtx.isHydrating).toBe(true);

                // The child can resolve within its scope
                withContext(CONSTRUCTION_CONTEXT_MARKER, childCtx, () => {
                    const resolved = currentConstructionContext().resolveCoordinate('0');
                    expect(resolved).toBe(
                        root.querySelector('[jay-coordinate="item-1/0"]'),
                    );
                });
            },
        );
    });
});
