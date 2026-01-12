import { clearGlobalContextRegistry, createJayContext, useContext, withContext } from '@jay-framework/runtime';
import { COUNT_CONTEXT, mkContext } from './context-tests-components/number-context';
import { LabelAndButtonComp } from './context-tests-components/label-and-button-component';
import { App } from './context-tests-components/app-component';
import { createSignal, registerReactiveGlobalContext } from '../lib';

describe('context api', () => {
    describe('classic case - component updates context on click, when then renders content from context', () => {
        // ---------- Providing component ----------

        describe('consumption only', () => {
            it('consuming component should read a value from a context', () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 12');
            });

            it('consuming component should be able to update context', async () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                await comp.element.refs.button.exec$((elem) => elem.click());
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 13');
            });

            it('random context update using context api should trigger component update', async () => {
                const context = mkContext();
                const comp = withContext(COUNT_CONTEXT, context, () => {
                    return LabelAndButtonComp({});
                });
                context.inc();
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 13');
            });

            it('should be able to call context api multiple times', async () => {
                const context = mkContext();
                const comp = withContext(COUNT_CONTEXT, context, () => {
                    return LabelAndButtonComp({});
                });
                context.inc();
                context.inc();
                context.inc();
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 15');
            });
        });

        describe('providing context', () => {
            it('provides and consumes context', () => {
                const app = App({});
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 12');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('12');
            });

            it('inc context value from parent', () => {
                const app = App({});
                app.element.refs.button.exec$((elem) => elem.click());
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 13');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('13');
            });

            it('inc context value from child', () => {
                const app = App({});
                (app.element.dom.querySelector('#component-button') as HTMLElement).click();
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 13');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('13');
            });
        });
    });

    describe('registerReactiveGlobalContext', () => {
        afterEach(() => {
            clearGlobalContextRegistry();
        });

        it('consuming component should read a value from a global reactive context', () => {
            // Register global context (similar to withClient init)
            registerReactiveGlobalContext(COUNT_CONTEXT, () => {
                const [count, setCount] = createSignal(12);
                const inc = () => setCount((n) => n + 1);
                return { count, inc, setCount };
            });

            // Component consumes global context without withContext wrapper
            const comp = LabelAndButtonComp({});
            expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 12');
        });

        it('component should react to signal changes in global reactive context', () => {
            // Register global context and keep reference
            const globalCtx = registerReactiveGlobalContext(COUNT_CONTEXT, () => {
                const [count, setCount] = createSignal(12);
                const inc = () => setCount((n) => n + 1);
                return { count, inc, setCount };
            });

            // Component consumes global context
            const comp = LabelAndButtonComp({});
            expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 12');

            // Update global context externally
            globalCtx.inc();
            expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 13');

            // Multiple updates
            globalCtx.inc();
            globalCtx.inc();
            expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 15');
        });

        it('registers a reactive context globally', () => {
            interface TestContext {
                value: () => number;
                setValue: (v: number) => void;
            }
            const TEST_CTX = createJayContext<TestContext>();

            const ctx = registerReactiveGlobalContext(TEST_CTX, () => {
                const [value, setValue] = createSignal(42);
                return { value, setValue };
            });

            expect(ctx.value()).toBe(42);

            // Should be retrievable via useContext
            const retrieved = useContext(TEST_CTX);
            expect(retrieved.value()).toBe(42);
        });

        it('returns the created context for immediate use', () => {
            interface CounterContext {
                count: () => number;
                increment: () => void;
            }
            const COUNTER_CTX = createJayContext<CounterContext>();

            const ctx = registerReactiveGlobalContext(COUNTER_CTX, () => {
                const [count, setCount] = createSignal(0);
                return {
                    count,
                    increment: () => setCount((n) => n + 1),
                };
            });

            // Can use the returned context immediately
            expect(ctx.count()).toBe(0);
            ctx.increment();
            expect(ctx.count()).toBe(1);

            // Global context reflects the same state
            const global = useContext(COUNTER_CTX);
            expect(global.count()).toBe(1);
        });

        it('supports async init pattern', async () => {
            interface AsyncContext {
                ready: () => boolean;
                data: () => string | null;
                init: () => Promise<void>;
            }
            const ASYNC_CTX = createJayContext<AsyncContext>();

            const ctx = registerReactiveGlobalContext(ASYNC_CTX, () => {
                const [ready, setReady] = createSignal(false);
                const [data, setData] = createSignal<string | null>(null);

                return {
                    ready,
                    data,
                    async init() {
                        // Simulate async work
                        await Promise.resolve();
                        setData('loaded');
                        setReady(true);
                    },
                };
            });

            expect(ctx.ready()).toBe(false);
            expect(ctx.data()).toBe(null);

            await ctx.init();

            expect(ctx.ready()).toBe(true);
            expect(ctx.data()).toBe('loaded');
        });
    });
});
