import {
    createJayContext,
    withContext,
    useContext,
    findContext,
    ConstructContext,
} from '../../lib';
import { restoreContext, saveContext, parentDataChain } from '../../lib/context';

describe('context', () => {
    interface TestContext {
        name: string;
    }
    const TEST_CONTEXT = createJayContext<TestContext>('test1');
    const TEST_CONTEXT_2 = createJayContext<TestContext>('test2');
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
        let test = findContext((_) => _ === TEST_CONTEXT);
        expect(test).not.toBeDefined();
    });

    it('findContext - should return undefined when no context matches the predicate', () => {
        let foundContext;
        withContext(TEST_CONTEXT, CONTEXT_VALUE, () => {
            foundContext = findContext((_) => _ === TEST_CONTEXT_2);
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

    // DL#193 Capability A — ConstructContext as a live per-scope carrier.
    describe('ConstructContext parent carrier', () => {
        it('forItem sets parent and update mutates data in place', () => {
            const root = new ConstructContext({ title: 'root' });
            const child = root.forItem({ name: 'a' }, 'a');
            expect(child.parent).toBe(root);
            expect(child.currData).toEqual({ name: 'a' });

            root.update({ title: 'root-2' });
            // child reads the parent live through the same object
            expect(child.parent!.currData).toEqual({ title: 'root-2' });
        });

        it('forAsync sets parent', () => {
            const root = new ConstructContext({ title: 'root' });
            const child = root.forAsync({ value: 1 });
            expect(child.parent).toBe(root);
        });

        it('parentDataChain returns ancestor data nearest-first', () => {
            const root = new ConstructContext({ level: 0 });
            const row = root.forItem({ level: 1 }, 'r');
            const cell = row.forItem({ level: 2 }, 'c');
            expect(parentDataChain(cell)).toEqual([{ level: 1 }, { level: 0 }]);
        });

        it('parentDataChain reflects live parent updates', () => {
            const root = new ConstructContext({ title: 'v1' });
            const child = root.forItem({ name: 'a' }, 'a');
            expect(parentDataChain(child)).toEqual([{ title: 'v1' }]);
            root.update({ title: 'v2' });
            expect(parentDataChain(child)).toEqual([{ title: 'v2' }]);
        });

        it('parentDataChain is empty for a context with no parent', () => {
            const root = new ConstructContext({ title: 'root' });
            expect(parentDataChain(root)).toEqual([]);
        });
    });
});
