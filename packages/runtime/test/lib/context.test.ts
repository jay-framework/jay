import {beforeEach, describe, expect, it} from '@jest/globals'
import {ConstructContext, currentConstructionContext, dynamicProperty as dp, element as e} from "../../lib";
import {createJayContext, provideContext, useContext, useOptionalContext} from "../../lib/context";

const SOME_VALUE = 'some text in the element';

describe('context', () => {
    interface ViewState {
        text: string
    }
    let data: ViewState = {text: SOME_VALUE};
    interface TestContext {
        name: string
    }
    const TEST_CONTEXT = createJayContext<TestContext>()
    const TEST_CONTEXT_2 = createJayContext<TestContext>()
    const CONTEXT_VALUE = {name: 'Jay'}
    const CONTEXT_VALUE_2 = {name: 'Smith'}

    it('should create and provide construction context', () => {
        let foundContext;
        provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            foundContext = useContext(TEST_CONTEXT);
        })
        expect(foundContext).toBeDefined();
    })

    it('provideContext should return the callback returned value', () => {
        let res = provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            return 'one'
        })
        expect(res).toEqual('one')
    })

    it('useContext - should fail with error to provide context when no context is set', () => {
        let test = () => useContext(TEST_CONTEXT);
        expect(test).toThrow();
    })

    it('useContext - should fail with error to provide context when no context of the same marker is set', () => {
        let test = () => provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            useContext(TEST_CONTEXT_2);
        })
        expect(test).toThrow();
    })

    it('useOptionalContext - should return undefined when no context is set', () => {
        let test = useOptionalContext(TEST_CONTEXT);
        expect(test).not.toBeDefined()
    })

    it('useOptionalContext - should return undefined when no context of the same marker is set', () => {
        let foundContext;
        provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            foundContext = useOptionalContext(TEST_CONTEXT_2);
        })
        expect(foundContext).not.toBeDefined();
    })

    it('should support nesting contexts of the same marker', () => {
        let foundContext;
        provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            provideContext(TEST_CONTEXT, CONTEXT_VALUE_2, () => {
                foundContext = useContext(TEST_CONTEXT);
            })
        })
        expect(foundContext).toEqual(CONTEXT_VALUE_2)
    })

    it('should support nesting contexts of different markers', () => {
        let foundContext, foundContext_2;
        provideContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            provideContext(TEST_CONTEXT_2, CONTEXT_VALUE_2, () => {
                foundContext = useContext(TEST_CONTEXT);
                foundContext_2 = useContext(TEST_CONTEXT_2);
            })
        })
        expect(foundContext).toEqual(CONTEXT_VALUE)
        expect(foundContext_2).toEqual(CONTEXT_VALUE_2)
    })

});

