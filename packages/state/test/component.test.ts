import {describe, expect, it, jest, beforeEach, afterEach} from '@jest/globals'
import {ConstructContext, JayElement, dynamicText as dt, element as e, JayComponent } from 'jay-runtime';
import {forTesting, makeJayComponent, Props} from "../lib/component";
import {Reactive} from "../lib/reactive";
const {reactiveContextStack, makePropsProxy} = forTesting

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

        function LabelComponent(props: Props<LabelProps>, refs: LabelRefs) {

            return {
                render: () => ({
                    label: props.label()
                })
            }
        }

        it('should render the component', () => {
            let label = makeJayComponent(renderLabelElement, LabelComponent)
            let instance = label({label: 'hello world'});
            expect(instance.element.refs.label.textContent).toBe('hello world')
        })

        it('should update the component on prop chagnes', () => {
            let label = makeJayComponent(renderLabelElement, LabelComponent)
            let instance = label({label: 'hello world'});
            instance.update({label: 'updated world'})
            expect(instance.element.refs.label.textContent).toBe('updated world')
        })
    })
})