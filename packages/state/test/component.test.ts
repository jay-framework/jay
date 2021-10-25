import {describe, expect, it} from '@jest/globals'
import {ConstructContext, JayElement, dynamicText as dt, element as e} from 'jay-runtime';
import {createEffect, createState, forTesting, makeJayComponent, Props} from "../lib/component";
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

        interface LabelProps {
            label: string
        }

        describe('with props', () => {

            function LabelComponent({label}: Props<LabelProps>, refs: LabelRefs) {

                return {
                    render: () => ({
                        label: label()
                    })
                }
            }

            it('should render the component', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponent)
                let instance = label({label: 'hello world'});
                expect(instance.element.refs.label.textContent).toBe('hello world')
            })

            it('should update the component on prop changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponent)
                let instance = label({label: 'hello world'});
                instance.update({label: 'updated world'})
                expect(instance.element.refs.label.textContent).toBe('updated world')
            })
        })

        describe('with state', () => {

            function LabelComponentWithInternalState(props: Props<LabelProps>, refs: LabelRefs) {

                let [label, setLabel] = createState('Hello ' + props.label());

                return {
                    render: () => ({
                        label: label()
                    }),
                    setLabel
                }
            }

            it('should render the component using state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                instance.update({label: 'mars'})
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })
        });

        describe('with state bound to prop', () => {

            function LabelComponentWithInternalState(props: Props<LabelProps>, refs: LabelRefs) {

                let [label, setLabel] = createState(() => 'Hello ' + props.label());

                return {
                    render: () => ({
                        label: label()
                    }),
                    setLabel
                }
            }

            it('should render the component using state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                expect(instance.element.refs.label.textContent).toBe('Hello world')
            })

            it('should update the component as state changes', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                instance.setLabel('hello mars')
                expect(instance.element.refs.label.textContent).toBe('hello mars')
            })

            it('should not update the component from prop change as the prop is not bound to state', () => {
                let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState)
                let instance = label({label: 'world'});
                instance.update({label: 'mars'})
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

            })

            it('should run rerun the effect on component re-mount', () => {

            })
        })

        describe('with create memo', () => {

        })

        describe('with expose component API functions', () => {

        })

        describe('with expose component API events', () => {

        })
    })
})