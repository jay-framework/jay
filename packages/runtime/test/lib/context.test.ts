import { createJayContext, withContext, useContext, findContext } from '../../lib';
import { restoreContext, saveContext } from '../../lib/context';

describe('context', () => {
    interface TestContext {
        name: string;
    }
    const TEST_CONTEXT = createJayContext<TestContext>();
    const TEST_CONTEXT_2 = createJayContext<TestContext>();
    const CONTEXT_VALUE = { name: 'Jay' };
    const CONTEXT_VALUE_2 = { name: 'Smith' };

    it('should create and provide construction context', () => {
        let foundContext: TestContext;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            foundContext = useContext(TEST_CONTEXT);
        });
        expect(foundContext).toBeDefined();
    });

    it('provideContext should return the callback returned value', () => {
        let res = withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            return 'one';
        });
        expect(res).toEqual('one');
    });

    it('useContext - should fail with error to provide context when no context is set', () => {
        let test = () => useContext(TEST_CONTEXT);
        expect(test).toThrow();
    });

    it('useContext - should fail with error to provide context when no context of the same marker is set', () => {
        let test = () =>
            withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
                useContext(TEST_CONTEXT_2);
            });
        expect(test).toThrow();
    });

    it('findContext - should return undefined when no context is available', () => {
        let test = findContext(_ => _ === TEST_CONTEXT);
        expect(test).not.toBeDefined();
    });

    it('findContext - should return undefined when no context matches the predicate', () => {
        let foundContext;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            foundContext = findContext(_ => _ === TEST_CONTEXT_2);
        });
        expect(foundContext).not.toBeDefined();
    });

    it('should support nesting contexts of the same marker', () => {
        let foundContext;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            withContext(TEST_CONTEXT, CONTEXT_VALUE_2, () => {
                foundContext = useContext(TEST_CONTEXT);
            });
        });
        expect(foundContext).toEqual(CONTEXT_VALUE_2);
    });

    it('should support nesting contexts of different markers', () => {
        let foundContext, foundContext_2;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            withContext(TEST_CONTEXT_2, CONTEXT_VALUE_2, () => {
                foundContext = useContext(TEST_CONTEXT);
                foundContext_2 = useContext(TEST_CONTEXT_2);
            });
        });
        expect(foundContext).toEqual(CONTEXT_VALUE);
        expect(foundContext_2).toEqual(CONTEXT_VALUE_2);
    });

    it('should support saving current context and restoring it later, to be used for forEach updates', () => {
        let foundContext, foundContext_2, savedContext;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            withContext(TEST_CONTEXT_2, CONTEXT_VALUE_2, () => {
                savedContext = saveContext();
            });
        });

        restoreContext(savedContext, () => {
            foundContext = useContext(TEST_CONTEXT);
            foundContext_2 = useContext(TEST_CONTEXT_2);
        });
        expect(foundContext).toEqual(CONTEXT_VALUE);
        expect(foundContext_2).toEqual(CONTEXT_VALUE_2);
    });
});
