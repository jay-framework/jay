import {describe, expect, it, jest, beforeEach} from '@jest/globals'
import {ConstructContext, JayElement, dynamicText as dt, element as e} from 'jay-runtime';
import {
    createEffect, createEvent,
    createMemo,
    createState,
    forTesting,
    makeJayComponent,
    Props
} from "../lib/component";
import {Reactive} from "jay-reactive";
const {makePropsProxy} = forTesting

describe('state management', () => {
    describe('Props', () => {

        it('should transform an object into a getters object', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12
            }
            let propsGetters: Props<typeof props> = makePropsProxy(reactive, props);

            expect(propsGetters.name()).toBe('abc')
            expect(propsGetters.age()).toBe(12)
        })

        it('should update values when given new props', () => {
            let reactive = new Reactive();
            const props = {
                name: 'abc',
                age: 12
            }
            let propsGetters = makePropsProxy(reactive, props);

            propsGetters.name()
            propsGetters.age()

            propsGetters.update({name: 'def'})

            expect(propsGetters.name()).toBe('def')
            expect(propsGetters.age()).toBe(12)
        })
    })

    describe('make component', () => {
        interface ViewState {
            label: string
        }

        interface LabelRefs {
            label: HTMLElement
        }
        interface LabelElement extends JayElement<ViewState, LabelRefs> {}

        function renderLabelElement(viewState: ViewState): LabelElement {
            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    e('div', {ref: 'label'}, [dt(vs => vs.label)])
                ])
            ) as LabelElement;
        }

        interface TwoLabelsViewState {
            label1: string
            label2: string
        }

        interface TwoLabelRefs {
            label1: HTMLElement
            label2: HTMLElement
        }
        interface TwoLabelsElement extends JayElement<TwoLabelsViewState, TwoLabelRefs> {}

        function renderTwoLabelElement(viewState: TwoLabelsViewState): TwoLabelsElement {
            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    e('div', {ref: 'label1'}, [dt(vs => vs.label1)]),
                    e('div', {ref: 'label2'}, [dt(vs => vs.label2)])
                ])
            ) as TwoLabelsElement;
        }

        describe('with props', () => {

            interface Name {
                name: string
            }

            function LabelComponent({name}: Props<Name>, refs: LabelRefs) {

                return {
                    render: () => ({
                        label: name()
                    })
                }
            }

            let label = makeJayComponent(renderLabelElement, LabelComponent)

            it('should render the component', () => {
                let instance = label({name: 'hello world'});
                expect(instance.element.refs.label.textContent).toBe('hello world')
            })

            it('should update the component on prop changes', () => {
                let instance = label({name: 'hello world'});
                instance.update({name: 'updated world'})
                expect(instance.element.refs.label.textContent).toBe('updated world')
            })
        })

        describe('with state', () => {

            interface Name {
                name: string
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {

                let [label, setLabel] = createState('Hello ' + props.name());

                return {
                    render: () => ({
                        label: label()
                    }),
                    setLabel
                }
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)

            it('should render the component using state', () => {
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let instance = label({name: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let instance = label({name: 'world'});
                instance.update({name: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })
        });

        describe('with state bound to prop', () => {

            interface Name {
                name: string
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {

                let [label, setLabel] = createState(() => 'Hello ' + props.name());

                return {
                    render: () => ({
                        label: label()
                    }),
                    setLabel
                }
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)

            it('should render the component using state', () => {
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let instance = label({name: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let instance = label({name: 'world'});
                instance.update({name: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('Hello mars')
            })
        })

        describe('with render view state as getters', () => {
            interface Name {
                firstName: string,
                lastName: string
            }

            function LabelComponentWithInternalState({firstName, lastName}: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createState(() => 'Hello ' + firstName() + ' ' + lastName());

                return {
                    render: () => ({
                        label
                    })
                }
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)

            it('should render initial component using a getter', () => {
                let instance = label({firstName: 'John', lastName: 'Smith'});
                expect(instance.element.refs.label.textContent).toBe('Hello John Smith')
            })

            it('should render updated component using a getter', () => {
                let instance = label({firstName: 'John', lastName: 'Smith'});
                instance.update({firstName: 'John', lastName: 'Adams'});
                expect(instance.element.refs.label.textContent).toBe('Hello John Adams')
            })
        })

        describe('with create effect', () => {

            interface Name {
                name: string
            }

            function LabelComponentWithCreateEffect({name}: Props<Name>, refs: LabelRefs) {
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
                    }
                })

                const getEffectState = () => ({resourceAllocated, effectRunCount, effectCleanupRunCount})

                return {
                    render: () => ({
                        label: label()
                    }),
                    getResourceState: getEffectState
                }
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect)

            it('should run create effect on initial component creation', () => {
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('hello world')
                expect(instance.getResourceState().resourceAllocated).toBe(true)
                expect(instance.getResourceState().effectRunCount).toBe(1)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(0)
            })

            it('should run the effect cleanup and rerun effect on dependencies change', () => {
                let instance = label({name: 'world'});
                instance.update({name: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('hello mars')
                expect(instance.getResourceState().resourceAllocated).toBe(true)
                expect(instance.getResourceState().effectRunCount).toBe(2)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1)
            })

            it('should run the effect cleanup on component unmount', () => {
                let instance = label({name: 'world'});
                instance.unmount();
                expect(instance.getResourceState().resourceAllocated).toBe(false)
                expect(instance.getResourceState().effectRunCount).toBe(1)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1)
            })

            it('should run rerun the effect on component re-mount', () => {
                let instance = label({name: 'world'});
                instance.unmount();
                instance.mount();
                expect(instance.getResourceState().resourceAllocated).toBe(true)
                expect(instance.getResourceState().effectRunCount).toBe(2)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1)
            })
        })

        describe('with create memo', () => {
            interface Name {
                name: string,
                age: number
            }

            function LabelComponentWithCreateMemo({name, age}: Props<Name>, refs: TwoLabelRefs) {
                let memoDependsOnName = 0, memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'hello ' + name();
                })
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'age ' + age();
                })
                const getMemoComputeCount = () => ({memoDependsOnName, memoDependsOnAge})

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2()
                    }),
                    getMemoComputeCount
                }
            }

            let labelComponent = makeJayComponent(renderTwoLabelElement, LabelComponentWithCreateMemo)

            it('should run create memo on initial render', () => {
                let instance = labelComponent({name: 'world', age: 12});
                expect(instance.element.refs.label1.textContent).toBe('hello world')
                expect(instance.element.refs.label2.textContent).toBe('age 12')
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(1)
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1)
            })

            it('should update only the memo dependent on name on only a name change', () => {
                let instance = labelComponent({name: 'world', age: 12});
                instance.update({name: 'mars', age: 12})
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(2)
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1)
            })

            it('should re-render when render depends on memo', () => {
                let instance = labelComponent({name: 'world', age: 12});
                instance.update({name: 'mars', age: 13})
                expect(instance.element.refs.label1.textContent).toBe('hello mars')
                expect(instance.element.refs.label2.textContent).toBe('age 13')
            })

            function LabelComponentWithCreateMemo2({}: Props<never>, refs: TwoLabelRefs) {
                let [state1, setState1] = createState('one')
                let memoDependsOnName = 0, memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'memo1: ' + state1();
                })
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'memo2: ' + label1();
                })
                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2()
                    }),
                    setState1
                }
            }
            let labelComponent2 = makeJayComponent(renderTwoLabelElement, LabelComponentWithCreateMemo2)

            it('should update memo that depend on a memo', () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                expect(instance.element.refs.label2.textContent).toBe('memo2: memo1: two')
            })

            it('should run render that depend on a memo', () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                expect(instance.element.refs.label1.textContent).toBe('memo1: two')
            })
        })

        describe('with expose component API', () => {
            interface Name {
                name: string,
                age: number
            }

            function LabelComponentWithAPI({name, age}: Props<Name>, refs: TwoLabelRefs) {
                let [label1, setLabel1] = createState(() => `hello ${name()}`)
                let label2 = createMemo(() => {
                    return 'age ' + age();
                })

                let getLabels = () => ({label1: label1(), label2: label2()})
                let updateLabel1 = newName => setLabel1(newName)

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2()
                    }),
                    getLabels,
                    updateLabel1
                }
            }

            let labelComponent = makeJayComponent(renderTwoLabelElement, LabelComponentWithAPI)

            it('functions that return data', () => {
                let instance = labelComponent({name: 'world', age: 12});
                let labels = instance.getLabels()
                expect(labels.label1).toBe('hello world');
                expect(labels.label2).toBe('age 12')
            })

            it('functions that change internal state', () => {
                let instance = labelComponent({name: 'world', age: 12});
                instance.updateLabel1('new value')
                expect(instance.element.refs.label1.textContent).toBe('new value');
            })
        })

        describe('with expose component API events', () => {

            interface CounterChangeEvent {
                value: number;
            }
            interface CounterViewState {
                value: number
            }

            interface CounterRefs {
                inc: HTMLElement,
                dec: HTMLElement,
                value: HTMLElement
            }
            interface CounterElement extends JayElement<CounterViewState, CounterRefs> {}

            function renderCounterElement(viewState: CounterViewState): CounterElement {
                return ConstructContext.withRootContext(viewState, () =>
                    e('div', {}, [
                        e('button', {ref: 'dec'}, ['dec']),
                        e('div', {ref: 'value'}, [dt(vs => vs.value)]),
                        e('button', {ref: 'inc'}, ['inc'])
                    ])
                ) as CounterElement;
            }

            interface CounterProps {
            }

            function CounterComponent({}: Props<CounterProps>, refs: CounterRefs) {
                let [value, setValue] = createState(0);
                refs.inc.onclick = () => setValue(value() + 1);
                refs.dec.onclick = () => setValue(value() - 1);
                let onChange = createEvent<CounterChangeEvent>(emitter => emitter.emit(({value: value()})))
                return {
                    render: () => ({value}),
                    onChange
                }
            }

            let counterComponent = makeJayComponent(renderCounterElement, CounterComponent)

            it('should register events and invoke the event', () => {
                let instance = counterComponent({});
                const myMock = jest.fn();
                instance.onChange = myMock;
                instance.element.refs.inc.click();
                expect(myMock.mock.calls.length).toBe(1);
            })

            it('should invoke event with payload', () => {
                let instance = counterComponent({});
                const myMock = jest.fn();
                instance.onChange = myMock;
                instance.element.refs.inc.click();
                instance.element.refs.inc.click();
                expect(myMock.mock.calls.length).toBe(2);
                expect(myMock.mock.calls[0][0]).toEqual({value: 1});
                expect(myMock.mock.calls[1][0]).toEqual({value: 2});
            })

        })

        describe('performance', () => {

            interface LabelAndButtonViewState {
                label: string
            }

            interface LabelAndButtonRefs {
                label: HTMLElement
                button: HTMLElement
            }
            interface LabelAndButtonElement extends JayElement<LabelAndButtonViewState, LabelAndButtonRefs> {}

            let renderCount = 0;

            function trackingLabelGetter(vs: LabelAndButtonViewState): string {
                renderCount += 1;
                return vs.label;
            }

            function renderTwoLabelElement(viewState: LabelAndButtonViewState): LabelAndButtonElement {
                return ConstructContext.withRootContext(viewState, () =>
                    e('div', {}, [
                        e('div', {ref: 'label'}, [dt(trackingLabelGetter)]),
                        e('button', {ref: 'button'}, ['click'])
                    ])
                ) as LabelAndButtonElement;
            }

            beforeEach(() => {
                renderCount = 0;
            })

            interface TwoProps {
                one: string,
                two: string
            }

            function TestComponent1({one, two}: Props<TwoProps>, refs: LabelAndButtonRefs) {
                return {
                    render: () => ({
                        label: `${one()} ${two()}`
                    })
                }
            }

            const Test1 = makeJayComponent(renderTwoLabelElement, TestComponent1);

            function TestComponent2({}: Props<null>, refs: LabelAndButtonRefs) {
                let [one, setOne] = createState('');
                let [two, setTwo] = createState('');
                const setValues = (a,b) => {
                    setOne(a);
                    setTwo(b);
                }
                refs.button.onclick = () => {
                    setOne('one');
                    setTwo('two');
                }
                return {
                    render: () => ({
                        label: `${one()} ${two()}`
                    }),
                    setValues
                }
            }

            const Test2 = makeJayComponent(renderTwoLabelElement, TestComponent2);

            it('should render only once on first render', () => {
                const instance = Test1({one: 'one', two: 'two'})
                expect(instance.element.refs.label.textContent).toBe('one two');
                expect(renderCount).toBe(1);
            })

            it('should render only once on multiple props update', () => {
                const instance = Test1({one: 'one', two: 'two'})
                instance.update({one: 'three', two: 'four'})
                expect(instance.element.refs.label.textContent).toBe('three four');
                expect(renderCount).toBe(2);
            })

            it('should render only once on multiple state updates from an API function', () => {
                const instance = Test2({})
                instance.setValues('one', 'two')
                expect(instance.element.refs.label.textContent).toBe('one two');
                expect(renderCount).toBe(2);
            })

            it('should render only once on multiple state updates from a ref event (DOM or nested component)', () => {
                const instance = Test2({})
                instance.element.refs.button.click()
                expect(instance.element.refs.label.textContent).toBe('one two');
                expect(renderCount).toBe(2);
            })
        })
    })
})