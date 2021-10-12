import {describe, expect, it, jest, beforeEach, afterEach} from '@jest/globals'
import {forTesting, Props} from "../lib";
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
})