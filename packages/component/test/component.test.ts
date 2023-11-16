import {
    ConstructContext,
    JayElement,
    dynamicText as dt,
    element as e,
    HTMLElementProxy,
    RenderElementOptions,
    provideContext,
} from 'jay-runtime';
import {
    COMPONENT_CONTEXT,
    createEffect,
    createEvent,
    createMemo,
    createPatchableState,
    createState,
    forTesting,
    makeJayComponent,
    Props,
    useReactive,
} from '../lib/component';
import { Reactive } from 'jay-reactive';
import { REPLACE } from 'jay-json-patch';
import { elemRef } from 'jay-runtime';
const { makePropsProxy } = forTesting;

describe('state management', () => {
    describe('Props', () => {
        const contextTestDefaults = { mounts: [], unmounts: [], getComponentInstance: () => null };
        it('should transform an object into a getters object', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = provideContext(
                COMPONENT_CONTEXT,
                { reactive, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            expect(propsGetters.name()).toBe('abc');
            expect(propsGetters.age()).toBe(12);
        });

        it('should update values when given new props', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12,
            };
            let updatableProps = provideContext(
                COMPONENT_CONTEXT,
                { reactive, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            updatableProps.name();
            updatableProps.age();

            updatableProps.update({ name: 'def', age: 12 });

            expect(props.name).toBe('abc'); // should not update the original props object
            expect(updatableProps.name()).toBe('def');
            expect(updatableProps.age()).toBe(12);
        });

        it('should give back the props using the .props property', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = provideContext(
                COMPONENT_CONTEXT,
                { reactive, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            expect(propsGetters.props()).toEqual(props);
        });

        it('should give back the updated props using the .props property', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = provideContext(
                COMPONENT_CONTEXT,
                { reactive, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            propsGetters.name();
            propsGetters.age();

            propsGetters.update({ name: 'def', age: 12 });

            expect(propsGetters.props()).toEqual({
                name: 'def',
                age: 12,
            });
        });
    });

    describe('make component', () => {
        interface ViewState {
            label: string;
        }

        interface LabelRefs {
            label: HTMLElementProxy<ViewState, HTMLElement>;
        }
        interface LabelElement extends JayElement<ViewState, LabelRefs> {}

        function renderLabelElement(viewState: ViewState): LabelElement {
            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [e('div', {}, [dt((vs) => vs.label)], elemRef('label'))]),
            ) as LabelElement;
        }

        interface TwoLabelsViewState {
            label1: string;
            label2: string;
        }

        interface TwoLabelRefs {
            label1: HTMLElementProxy<TwoLabelsViewState, HTMLElement>;
            label2: HTMLElementProxy<TwoLabelsViewState, HTMLElement>;
        }
        interface TwoLabelsElement extends JayElement<TwoLabelsViewState, TwoLabelRefs> {}

        function renderTwoLabelElement(viewState: TwoLabelsViewState): TwoLabelsElement {
            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    e('div', {}, [dt((vs) => vs.label1)], elemRef('label1')),
                    e('div', {}, [dt((vs) => vs.label2)], elemRef('label2')),
                ]),
            ) as TwoLabelsElement;
        }

        describe('with props', () => {
            interface Name {
                name: string;
            }

            function LabelComponent({ name }: Props<Name>, refs: LabelRefs) {
                return {
                    render: () => ({
                        label: name(),
                    }),
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponent);

            it('should render the component', async () => {
                let instance = label({ name: 'hello world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
            });

            it('should update the component on prop changes', async () => {
                let instance = label({ name: 'hello world' });
                instance.update({ name: 'updated world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('updated world'),
                );
            });
        });

        describe('with state', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createState('Hello ' + props.name());

                return {
                    render: () => ({
                        label: label(),
                    }),
                    setLabel,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render the component using state', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });

            it('should update the component as state changes', async () => {
                let instance = label({ name: 'world' });
                instance.setLabel('hello mars');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });

            it('should not update the component from prop change as the prop is not bound to state', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });
        });

        describe('with patchable state', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [data, setData, patchData] = createPatchableState({
                    label: 'Hello ' + props.name(),
                });

                return {
                    render: () => ({
                        label: data().label,
                    }),
                    patchData,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should update the component as data is patched', async () => {
                let instance = label({ name: 'world' });
                instance.patchData({ op: REPLACE, path: ['label'], value: 'hello mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });
        });

        describe('with state bound to prop', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createState(() => 'Hello ' + props.name());

                return {
                    render: () => ({
                        label: label(),
                    }),
                    setLabel,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render the component using state', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });

            it('should update the component as state changes', async () => {
                let instance = label({ name: 'world' });
                instance.setLabel('hello mars');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });

            it('should not update the component from prop change as the prop is not bound to state', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello mars'),
                );
            });
        });

        describe('with render view state as getters', () => {
            interface Name {
                firstName: string;
                lastName: string;
            }

            function LabelComponentWithInternalState(
                { firstName, lastName }: Props<Name>,
                refs: LabelRefs,
            ) {
                let [label, setLabel] = createState(
                    () => 'Hello ' + firstName() + ' ' + lastName(),
                );

                return {
                    render: () => ({
                        label,
                    }),
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render initial component using a getter', async () => {
                let instance = label({ firstName: 'John', lastName: 'Smith' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello John Smith'),
                );
            });

            it('should render updated component using a getter', async () => {
                let instance = label({ firstName: 'John', lastName: 'Smith' });
                instance.update({ firstName: 'John', lastName: 'Adams' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello John Adams'),
                );
            });
        });

        describe('with create effect', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithCreateEffect({ name }: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createState('');
                let resourceAllocated = false;
                let effectRunCount = 0;
                let effectCleanupRunCount = 0;
                createEffect(() => {
                    setLabel('hello ' + name());
                    resourceAllocated = true;
                    effectRunCount += 1;
                    return () => {
                        resourceAllocated = false;
                        effectCleanupRunCount += 1;
                    };
                });

                const getEffectState = () => ({
                    resourceAllocated,
                    effectRunCount,
                    effectCleanupRunCount,
                });

                return {
                    render: () => ({
                        label: label(),
                    }),
                    getResourceState: getEffectState,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect);

            it('should run create effect on initial component creation', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(1);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(0);
            });

            it('should run the effect cleanup and rerun effect on dependencies change', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(2);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });

            it('should run the effect cleanup on component unmount', () => {
                let instance = label({ name: 'world' });
                instance.unmount();
                expect(instance.getResourceState().resourceAllocated).toBe(false);
                expect(instance.getResourceState().effectRunCount).toBe(1);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });

            it('should run rerun the effect on component re-mount', () => {
                let instance = label({ name: 'world' });
                instance.unmount();
                instance.mount();
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(2);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });
        });

        describe('with create memo', () => {
            interface Name {
                name: string;
                age: number;
            }

            function LabelComponentWithCreateMemo({ name, age }: Props<Name>, refs: TwoLabelRefs) {
                let memoDependsOnName = 0,
                    memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'hello ' + name();
                });
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'age ' + age();
                });
                const getMemoComputeCount = () => ({ memoDependsOnName, memoDependsOnAge });

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    getMemoComputeCount,
                };
            }

            let labelComponent = makeJayComponent(
                renderTwoLabelElement,
                LabelComponentWithCreateMemo,
            );

            it('should run create memo on initial render', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('age 12'),
                );
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(1);
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1);
            });

            it('should update only the memo dependent on name on only a name change', () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.update({ name: 'mars', age: 12 });
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(2);
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1);
            });

            it('should re-render when render depends on memo', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.update({ name: 'mars', age: 13 });
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('age 13'),
                );
            });

            function LabelComponentWithCreateMemo2({}: Props<never>, refs: TwoLabelRefs) {
                let [state1, setState1] = createState('one');
                let memoDependsOnName = 0,
                    memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'memo1: ' + state1();
                });
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'memo2: ' + label1();
                });
                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    setState1,
                };
            }
            let labelComponent2 = makeJayComponent(
                renderTwoLabelElement,
                LabelComponentWithCreateMemo2,
            );

            it('should update memo that depend on a memo', async () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('memo2: memo1: two'),
                );
            });

            it('should run render that depend on a memo', async () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('memo1: two'),
                );
            });
        });

        describe('with expose component API', () => {
            interface Name {
                name: string;
                age: number;
            }

            function LabelComponentWithAPI({ name, age }: Props<Name>, refs: TwoLabelRefs) {
                let [label1, setLabel1] = createState(() => `hello ${name()}`);
                let label2 = createMemo(() => {
                    return 'age ' + age();
                });

                let getLabels = () => ({ label1: label1(), label2: label2() });
                let updateLabel1 = (newName) => setLabel1(newName);

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    getLabels,
                    updateLabel1,
                };
            }

            let labelComponent = makeJayComponent(renderTwoLabelElement, LabelComponentWithAPI);

            it('functions that return data', () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                let labels = instance.getLabels();
                expect(labels.label1).toBe('hello world');
                expect(labels.label2).toBe('age 12');
            });

            it('functions that change internal state', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.updateLabel1('new value');
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('new value'),
                );
            });
        });

        describe('with expose component API events', () => {
            interface CounterChangeEvent {
                value: number;
            }
            interface CounterViewState {
                value: number;
            }

            interface CounterRefs {
                inc: HTMLElementProxy<CounterViewState, HTMLElement>;
                dec: HTMLElementProxy<CounterViewState, HTMLElement>;
                value: HTMLElementProxy<CounterViewState, HTMLElement>;
            }
            interface CounterElement extends JayElement<CounterViewState, CounterRefs> {}

            function renderCounterElement(
                viewState: CounterViewState,
                options?: RenderElementOptions,
            ): CounterElement {
                return ConstructContext.withRootContext(
                    viewState,
                    () =>
                        e('div', {}, [
                            e('button', {}, ['dec'], elemRef('dec')),
                            e('div', {}, [dt((vs) => vs.value)], elemRef('value')),
                            e('button', {}, ['inc'], elemRef('inc')),
                        ]),
                    options,
                ) as CounterElement;
            }

            interface CounterProps {}

            function CounterComponent({}: Props<CounterProps>, refs: CounterRefs) {
                let [value, setValue] = createState(0);
                refs.inc.onclick(() => setValue(value() + 1));
                refs.dec.onclick(() => setValue(value() - 1));
                let onChange = createEvent<CounterChangeEvent>((emitter) =>
                    emitter.emit({ value: value() }),
                );
                return {
                    render: () => ({ value }),
                    onChange,
                };
            }

            let counterComponent = makeJayComponent(renderCounterElement, CounterComponent);

            it('should register events using on-event property and invoke the event', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(1);
            });

            it('should unregister events', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                instance.onChange(undefined);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(0);
            });
            it('should invoke event with payload', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(2);
                expect(myMock.mock.calls[0][0]).toEqual({ event: { value: 1 } });
                expect(myMock.mock.calls[1][0]).toEqual({ event: { value: 2 } });
            });

            it('should register events using addEventListener and invoke the event', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.addEventListener('Change', myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(1);
            });

            it('should register and remove events', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.addEventListener('Change', myMock);
                instance.removeEventListener('Change', myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(0);
            });
        });

        describe('performance', () => {
            interface LabelAndButtonViewState {
                label: string;
            }

            interface LabelAndButtonRefs {
                label: HTMLElementProxy<LabelAndButtonViewState, HTMLElement>;
                button: HTMLElementProxy<LabelAndButtonViewState, HTMLElement>;
            }
            interface LabelAndButtonElement
                extends JayElement<LabelAndButtonViewState, LabelAndButtonRefs> {}

            let renderCount = 0;

            function trackingLabelGetter(vs: LabelAndButtonViewState): string {
                renderCount += 1;
                return vs.label;
            }

            function renderTwoLabelElement(
                viewState: LabelAndButtonViewState,
                options?: RenderElementOptions,
            ): LabelAndButtonElement {
                return ConstructContext.withRootContext(
                    viewState,
                    () =>
                        e('div', {}, [
                            e('div', {}, [dt(trackingLabelGetter)], elemRef('label')),
                            e('button', {}, ['click'], elemRef('button')),
                        ]),
                    options,
                ) as LabelAndButtonElement;
            }

            beforeEach(() => {
                renderCount = 0;
            });

            interface TwoProps {
                one: string;
                two: string;
            }

            function TestComponent1({ one, two }: Props<TwoProps>, refs: LabelAndButtonRefs) {
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                };
            }

            const Test1 = makeJayComponent(renderTwoLabelElement, TestComponent1);

            function TestComponent2({}: Props<null>, refs: LabelAndButtonRefs) {
                let [one, setOne] = createState('');
                let [two, setTwo] = createState('');
                const setValues = (a, b) => {
                    setOne(a);
                    setTwo(b);
                };
                refs.button.onclick(() => {
                    setOne('one');
                    setTwo('two');
                });
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                    setValues,
                };
            }

            const Test2 = makeJayComponent(renderTwoLabelElement, TestComponent2);

            function asyncOperation(one: number, two: number): Promise<number> {
                return new Promise((resolve) => {
                    setImmediate((_) => resolve(one + two));
                });
            }

            function TestComponent3({}: Props<null>, refs: LabelAndButtonRefs) {
                let [one, setOne] = createState(12);
                let [two, setTwo] = createState(34);
                let [three, setThree] = createState(0);
                let reactive = useReactive();
                let [isWaiting, resolve] = mkResolvablePromise();
                refs.button.onclick(async () => {
                    let apiResult = await asyncOperation(one(), two());
                    setOne(0);
                    setTwo(0);
                    setThree(apiResult);
                    resolve();
                });
                const forAPItoFinish = () => isWaiting;
                const getReactive = () => reactive;
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                    forAPItoFinish,
                    getReactive,
                    three,
                };
            }

            const Test3 = makeJayComponent(renderTwoLabelElement, TestComponent3);
            const initialRenderCycles = 2;

            it('should render twice static elements on first render (before any update)', async () => {
                const instance = Test1({ one: 'one', two: 'two' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles);
            });

            it('should render only once on prop update (in addition to initial renders)', async () => {
                const instance = Test1({ one: 'one', two: 'two' });
                instance.update({ one: 'three', two: 'four' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('three four'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on multiple state updates from an API function', async () => {
                const instance = Test2({});
                instance.setValues('one', 'two');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on multiple state updates from a ref event (DOM or nested component)', async () => {
                const instance = Test2({});
                await instance.element.refs.button.exec$((elem) => elem.click());
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on async API call and multiple state updates', async () => {
                const instance = Test3({});
                // those two getters have to be called before the button click so that the component API call will not flush
                // the reactions of the state management after the API call
                const waitingForAPIToFinish = instance.forAPItoFinish();
                const reactive = instance.getReactive();
                //
                await instance.element.refs.button.exec$((elem) => elem.click());
                await waitingForAPIToFinish;
                await reactive.toBeClean();
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('0 0'),
                );
                expect(instance.three()).toBe(46);
                expect(renderCount).toBe(initialRenderCycles + 1);
            });
        });
    });
});

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise, resolve];
}
