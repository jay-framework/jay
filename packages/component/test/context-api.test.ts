import {
    childComp,
    ConstructContext,
    createJayContext,
    dynamicText as dt,
    element as e,
    HTMLElementProxy,
    JayElement,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
    withContext,
} from 'jay-runtime';
import { createReactiveContext, createState, makeJayComponent, Props } from '../lib';
import { Getter, Setter } from 'jay-reactive';

describe('context api', () => {
    describe('classic case - component updates context on click, when then renders content from context', () => {
        // ---------- Label and Button element ----------
        interface LabelAndButtonViewState {
            label: string;
        }

        interface LabelAndButtonRefs {
            button: HTMLElementProxy<LabelAndButtonViewState, HTMLButtonElement>;
        }
        interface LabelAndButtonElement
            extends JayElement<LabelAndButtonViewState, LabelAndButtonRefs> {}
        type LabelAndButtonElementRender = RenderElement<
            LabelAndButtonViewState,
            LabelAndButtonRefs,
            LabelAndButtonElement
        >;
        type LabelAndButtonElementPreRender = [
            refs: LabelAndButtonRefs,
            LabelAndButtonElementRender,
        ];

        function renderLabelElement(
            options?: RenderElementOptions,
        ): LabelAndButtonElementPreRender {
            const [refManager, [button]] = ReferencesManager.for(options, ['button'], [], [], []);
            const render = (viewState: LabelAndButtonViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return e('div', {}, [dt((vs) => vs.label), e('button', {}, [], button())]);
                }) as LabelAndButtonElement;
            return [refManager.getPublicAPI() as LabelAndButtonRefs, render];
        }

        // ---------- Number Context ----------
        interface CountContext {
            count: Getter<number>;
            setCount: Setter<number>;
            inc: () => void;
        }
        const COUNT_CONTEXT = createJayContext<CountContext>();
        const mkContext = () =>
            createReactiveContext(() => {
                const [count, setCount] = createState(12);
                const inc = () => {
                    setCount((_) => _ + 1);
                };
                return { count, inc, setCount };
            });

        // ---------- Consuming component ----------
        interface CompProps {}
        function LabelAndButtonComponent(
            {}: Props<CompProps>,
            refs: LabelAndButtonRefs,
            { count, inc }: CountContext,
        ) {
            refs.button.onclick(() => inc());
            return {
                render: () => ({
                    label: () => `the count is ${count()}`,
                }),
            };
        }
        const LabelAndButtonComp = makeJayComponent(
            renderLabelElement,
            LabelAndButtonComponent,
            COUNT_CONTEXT,
        );

        // ---------- Providing component ----------
        interface AppViewState {}
        interface AppRefs {
            labelAndButton: ReturnType<typeof LabelAndButtonComp>;
        }
        interface AppElement extends JayElement<AppViewState, AppRefs> {}
        type AppElementRender = RenderElement<AppViewState, AppRefs, AppElement>;
        type AppElementPreRender = [refs: AppRefs, AppElementRender];

        function AppElement(options?: RenderElementOptions): AppElementPreRender {
            const [refManager, [labelAndButton]] = ReferencesManager.for(
                options,
                ['labelAndButton'],
                [],
                [],
                [],
            );
            const render = (viewState: AppViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return e('div', {}, [
                        childComp(LabelAndButtonComp, (vs) => ({}), labelAndButton()),
                    ]);
                }) as AppElement;
            return [refManager.getPublicAPI() as AppRefs, render];
        }

        interface AppProps {}
        function AppComponentConstructor({}: Props<AppProps>, refs: AppRefs) {
            return {
                render: () => ({}),
            };
        }

        const App = makeJayComponent(AppElement, AppComponentConstructor);

        describe('consumption only', () => {
            it('consuming component should read a value from a context', () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                expect(comp.element.dom.textContent).toBe('the count is 12');
            });

            it('consuming component should be able to update context', async () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                await comp.element.refs.button.exec$((elem) => elem.click());
                expect(comp.element.dom.textContent).toBe('the count is 13');
            });

            it('random context update using context api should trigger component update', async () => {
                const context = mkContext();
                const comp = withContext(COUNT_CONTEXT, context, () => {
                    return LabelAndButtonComp({});
                });
                context.inc();
                expect(comp.element.dom.textContent).toBe('the count is 13');
            });
        });
    });
});
