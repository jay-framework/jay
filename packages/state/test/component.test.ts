import {describe, expect, it} from '@jest/globals'
import {ConstructContext, JayElement, dynamicText as dt, element as e} from 'jay-runtime';
import {createEffect, createMemo, createState, forTesting, makeJayComponent, Props} from "../lib/component";
import {Reactive} from "../lib/reactive";
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

            it('should render the component', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponent)
                let instance = label({name: 'hello world'});
                expect(instance.element.refs.label.textContent).toBe('hello world')
            })

            it('should update the component on prop changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponent)
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

            it('should render the component using state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({name: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
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

            it('should render the component using state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({name: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({name: 'world'});
                instance.update({name: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('Hello mars')
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

            it('should run create effect on initial component creation', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect)
                let instance = label({name: 'world'});
                expect(instance.element.refs.label.textContent).toBe('hello world')
                expect(instance.getResourceState().resourceAllocated).toBe(true)
                expect(instance.getResourceState().effectRunCount).toBe(1)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(0)
            })

            it('should run the effect cleanup and rerun effect on dependencies change', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect)
                let instance = label({name: 'world'});
                instance.update({name: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('hello mars')
                expect(instance.getResourceState().resourceAllocated).toBe(true)
                expect(instance.getResourceState().effectRunCount).toBe(2)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1)
            })

            it('should run the effect cleanup on component unmount', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect)
                let instance = label({name: 'world'});
                instance.unmount();
                expect(instance.getResourceState().resourceAllocated).toBe(false)
                expect(instance.getResourceState().effectRunCount).toBe(1)
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1)
            })

            it('should run rerun the effect on component re-mount', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect)
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

            it('should run create memo on initial render', () => {
                let label = makeJayComponent(renderTwoLabelElement, LabelComponentWithCreateMemo)
                let instance = label({name: 'world', age: 12});
                expect(instance.element.refs.label1.textContent).toBe('hello world')
                expect(instance.element.refs.label2.textContent).toBe('age 12')
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(1)
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1)
            })

            it('should update only the memo dependent on name on only a name change', () => {
                let label = makeJayComponent(renderTwoLabelElement, LabelComponentWithCreateMemo)
                let instance = label({name: 'world', age: 12});
                instance.update({name: 'mars', age: 12})
                expect(instance.element.refs.label1.textContent).toBe('hello world')
                expect(instance.element.refs.label2.textContent).toBe('age 12')
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(2)
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1)
            })
        })

        describe('with expose component API functions', () => {

        })

        describe('with expose component API events', () => {

        })
    })
})