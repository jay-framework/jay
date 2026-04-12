import {
    ConstructContext,
    ReferencesManager,
    adoptText,
    currentConstructionContext,
    withContext,
    element as e,
    noopMount,
    noopUpdate,
} from '../../../lib';
import { CONSTRUCTION_CONTEXT_MARKER } from '../../../lib/context';
import { hydrate } from './hydration-test-utils';

describe('coordinate resolution', () => {
    // Test #34: finds element by ref coordinate
    it('finds element by ref coordinate', () => {
        let adoptedDom: Element | undefined;
        const { root } = hydrate(
            '<div jay-coordinate="content">Text</div>',
            { text: 'Text' },
            () => {
                const el = adoptText('content', (vs: { text: string }) => vs.text);
                adoptedDom = el.dom;
                return el;
            },
        );
        expect(adoptedDom).toBe(root.querySelector('[jay-coordinate="content"]'));
    });

    // Test #35: finds element by auto-index
    it('finds element by auto-index coordinate', () => {
        let adoptedDom: Element | undefined;
        const { root } = hydrate('<h1 jay-coordinate="0">Title</h1>', { title: 'Title' }, () => {
            const el = adoptText('0', (vs: { title: string }) => vs.title);
            adoptedDom = el.dom;
            return el;
        });
        expect(adoptedDom).toBe(root.querySelector('[jay-coordinate="0"]'));
    });

    // Test #36: finds element in forEach scope via forScope (DL#126)
    it('finds element in forEach scope via forScope context', () => {
        let adoptedDom: Element | undefined;
        const { root } = hydrate<any>(
            '<li jay-coordinate="0/0">' + '<span jay-coordinate="S1/0">Widget</span>' + '</li>',
            { items: [{ id: 'item-1', name: 'Widget' }] },
            () => {
                // Simulate forEach item scoping: resolve item root, build local scope
                const ctx = currentConstructionContext();
                const itemDom = ctx.resolveCoordinate('0/0')!;
                const scopedCtx = ctx
                    .forScope(itemDom)
                    .forItem({ id: 'item-1', name: 'Widget' }, 'item-1');
                return withContext(CONSTRUCTION_CONTEXT_MARKER, scopedCtx, () => {
                    const el = adoptText('S1/0', (vs: { name: string }) => vs.name);
                    adoptedDom = el.dom;
                    return el;
                });
            },
        );
        expect(adoptedDom).toBe(root.querySelector('[jay-coordinate="S1/0"]'));
    });

    // Test #37: scoped coordinates resolve directly (no chained prefix accumulation)
    it('scoped coordinates resolve directly without prefix accumulation', () => {
        let adoptedDom: Element | undefined;
        const { root } = hydrate('<div jay-coordinate="S2/0">Nested</div>', {}, () => {
            const ctx = currentConstructionContext();
            // With scoped coordinates, the key is fully qualified — no prefix needed
            const el = adoptText('S2/0', (vs: any) => 'Nested');
            adoptedDom = el.dom;
            return el;
        });
        expect(adoptedDom).toBe(root.querySelector('[jay-coordinate="S2/0"]'));
    });

    // Test #38: handles missing coordinate gracefully
    it('handles missing coordinate gracefully — warns in dev mode, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        hydrate('<h1 jay-coordinate="0">Title</h1>', { text: 'hello' }, () => {
            // Try to adopt a coordinate that doesn't exist
            const el = adoptText('nonexistent', (vs: any) => vs.text);
            // Should not throw, returns a noop element
            expect(el.dom).toBeUndefined();
            return el;
        });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
        warnSpy.mockRestore();
    });

    // Verify isHydrating is true inside hydration context
    it('isHydrating returns true inside withHydrationRootContext', () => {
        let wasHydrating = false;

        hydrate('<h1 jay-coordinate="0">Test</h1>', {}, () => {
            wasHydrating = currentConstructionContext().isHydrating;
            return {
                dom: undefined as any,
                update: noopUpdate,
                mount: noopMount,
                unmount: noopMount,
            };
        });

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

    // Verify forScope propagates coordinateMap
    it('forScope builds local coordinateMap from subtree', () => {
        let resolvedEl: Element | undefined;
        const { root } = hydrate(
            '<div jay-coordinate="0/0"><span jay-coordinate="S1/0">Child Text</span></div>',
            {},
            () => {
                const ctx = currentConstructionContext();
                expect(ctx.isHydrating).toBe(true);
                const itemDom = ctx.resolveCoordinate('0/0')!;
                const scopedCtx = ctx.forScope(itemDom);
                expect(scopedCtx.isHydrating).toBe(true);

                // The scoped context can resolve within its local map
                withContext(CONSTRUCTION_CONTEXT_MARKER, scopedCtx, () => {
                    resolvedEl = currentConstructionContext().resolveCoordinate('S1/0');
                });
                return {
                    dom: undefined as any,
                    update: noopUpdate,
                    mount: noopMount,
                    unmount: noopMount,
                };
            },
        );
        expect(resolvedEl).toBe(root.querySelector('[jay-coordinate="S1/0"]'));
    });
});
