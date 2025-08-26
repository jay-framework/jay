import {
    JayElement,
    ReferencesManager,
    ConstructContext,
    dynamicElement as de,
    element as e, dynamicText as dt, pending, rejected, resolved, forEach
} from '../../lib';

function mkPromise<T>(): [(v: T) => void, (reason?: any) => void, Promise<any>] {
    let resolve: (v: T) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    promise.catch(() => {}); // Prevent unhandled rejection

    return [resolve!, reject!, promise];
}

async function ignoreErrors(op: Promise<any>) {
    try {
        await op;
    }
    catch (e) {}
}

const STILL_LOADING = "still loading"
const RESOLVED = "resolved to a value"
const RESOLVED_2 = "resolved to another value"
const PROMISE_ERROR = "promise rejected with this error"

describe('async-element', () => {
    interface ViewState {
        text1: Promise<string>;
    }
    function makeElement(data: ViewState): JayElement<ViewState, any> {
        let [refManager, []] = ReferencesManager.for({}, [], [], [], []);
        return ConstructContext.withRootContext(data, refManager, () =>
            // noinspection DuplicatedCode
            de('div', {id: 'parent'}, [
                pending(
                    (vs: ViewState) => vs.text1,
                    () => e('div', { style: { cssText: 'color:gray' }, id: 'pending-div' }, [
                        STILL_LOADING,
                    ]),
                ),
                resolved(
                    (vs: ViewState) => vs.text1,
                    () =>
                        e('div', { style: { cssText: 'color:red' }, id: 'resolved-div' }, [
                            dt((data) => data),
                        ]),
                ),
                rejected(
                    (vs: ViewState) => vs.text1,
                    () =>
                        e('div', { style: { cssText: 'color:red' }, id: 'rejected-div' }, [
                            dt((data: Error) => data.message),
                        ]),
                ),
            ]),
        );
    }

    describe('initial rendering', () => {

        it('should render pending promise on next microtask', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            resolve1(RESOLVED);
            let jayElement = makeElement({ text1: promise1 });
            expect(jayElement.dom.children).toHaveLength(0);
            await promise1

            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#resolved-div').innerHTML).toBe(RESOLVED);
        });

        it('should render rejected promise on next microtask', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });
            await Promise.resolve();

            reject1(new Error(PROMISE_ERROR));
            expect(jayElement.dom.children).toHaveLength(0);
            await ignoreErrors(promise1);

            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#rejected-div').innerHTML).toBe(PROMISE_ERROR);
        });

        it('should render pending with 1 ms', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });
            expect(jayElement.dom.children).toHaveLength(0);
            await vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div').innerHTML).toBe(STILL_LOADING);
            })
        });

        it('should render pending then resolved', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });
            expect(jayElement.dom.children).toHaveLength(0);
            await vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div').innerHTML).toBe(STILL_LOADING);
            })

            resolve1(RESOLVED);
            await promise1;
            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#resolved-div').innerHTML).toBe(RESOLVED);
        });

        it('should render pending then rejected', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });
            expect(jayElement.dom.children).toHaveLength(0);
            await vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div').innerHTML).toBe(STILL_LOADING);
            })

            reject1(new Error(PROMISE_ERROR));
            await ignoreErrors(promise1);

            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#rejected-div').innerHTML).toBe(PROMISE_ERROR);
        });
    })

    describe('updating promise', () => {
        it('should render pending promise on next microtask', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            resolve1(RESOLVED);
            let jayElement = makeElement({ text1: promise1 });
            await promise1

            const [resolve2, reject2, promise2] = mkPromise<string>();
            resolve2(RESOLVED_2);
            jayElement.update({ text1: promise2 })
            await promise2

            expect(jayElement.dom.querySelector('#resolved-div').innerHTML).toBe(RESOLVED_2);
        });

        it('should handle race condition of promise 1, update to promise 2, promise 2 resolved, then promise 1 resolved - should ignore promise 1 resolved value', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });

            const [resolve2, reject2, promise2] = mkPromise<string>();
            jayElement.update({ text1: promise2 })
            resolve2(RESOLVED_2);
            await promise2

            resolve1(RESOLVED);
            await promise1

            expect(jayElement.dom.querySelector('#resolved-div').innerHTML).toBe(RESOLVED_2);
        });
    })

    describe('async array promise', () => {
        interface Item {
            name: string;
            id: string;
        }

        interface ArrayViewState {
            items: Promise<Array<Item>>;
        }

        const item1 = { name: 'Item 1', id: 'item-1' };
        const item2 = { name: 'Item 2', id: 'item-2' };
        const item3 = { name: 'Item 3', id: 'item-3' };

        function makeArrayElement(data: ArrayViewState): JayElement<ArrayViewState, any> {
            let [refManager, []] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', {id: 'parent'}, [
                    pending(
                        (vs: ArrayViewState) => vs.items,
                        () => e('div', { id: 'pending-div' }, [
                            'Loading items...',
                        ]),
                    ),
                    resolved(
                        (vs: ArrayViewState) => vs.items,
                        () =>
                            de('div', { id: 'resolved-div' }, [
                                forEach(
                                    (items: Array<Item>) => items,
                                    (item: Item) => {
                                        return e('div', { class: 'item', id: item.id }, [
                                            dt((item) => item.name),
                                        ]);
                                    },
                                    'id',
                                ),
                            ]),
                    ),
                    rejected(
                        (vs: ArrayViewState) => vs.items,
                        () =>
                            e('div', { id: 'rejected-div' }, [
                                'Failed to load items',
                            ]),
                    ),
                ]),
            );
        }

        it('should render pending then resolved array of items', async () => {
            const [resolve, reject, promise] = mkPromise<Array<Item>>();
            let jayElement = makeArrayElement({ items: promise });
            
            // Initially should have no children
            expect(jayElement.dom.children).toHaveLength(0);
            
            // Should show pending state
            await vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div')).toHaveTextContent('Loading items...');
            });

            // Resolve the promise with array of items
            resolve([item1, item2, item3]);
            await promise;

            // Should show resolved state with items
            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#resolved-div')).toBeTruthy();
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
            expect(jayElement.dom.querySelector('#' + item1.id)).toHaveTextContent(item1.name);
            expect(jayElement.dom.querySelector('#' + item2.id)).toHaveTextContent(item2.name);
            expect(jayElement.dom.querySelector('#' + item3.id)).toHaveTextContent(item3.name);
        });

        it('should handle promise rejection for array', async () => {
            const [resolve, reject, promise] = mkPromise<Array<Item>>();
            let jayElement = makeArrayElement({ items: promise });
            
            // Initially should have no children
            expect(jayElement.dom.children).toHaveLength(0);
            
            // Should show pending state
            await vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div')).toHaveTextContent('Loading items...');
            });

            // Reject the promise
            reject(new Error('Failed to fetch items'));
            await ignoreErrors(promise);

            // Should show rejected state
            expect(jayElement.dom.children).toHaveLength(1);
            expect(jayElement.dom.querySelector('#rejected-div')).toHaveTextContent('Failed to load items');
        });

        it('should update from one resolved array to another', async () => {
            const [resolve1, reject1, promise1] = mkPromise<Array<Item>>();
            resolve1([item1, item2]);
            let jayElement = makeArrayElement({ items: promise1 });
            await promise1;

            // Should show first resolved array
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(2);
            expect(jayElement.dom.querySelector('#' + item1.id)).toHaveTextContent(item1.name);
            expect(jayElement.dom.querySelector('#' + item2.id)).toHaveTextContent(item2.name);

            // Update with new promise
            const [resolve2, reject2, promise2] = mkPromise<Array<Item>>();
            resolve2([item1, item2, item3]);
            jayElement.update({ items: promise2 });
            await promise2;

            // Should show updated array
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
            expect(jayElement.dom.querySelector('#' + item1.id)).toHaveTextContent(item1.name);
            expect(jayElement.dom.querySelector('#' + item2.id)).toHaveTextContent(item2.name);
            expect(jayElement.dom.querySelector('#' + item3.id)).toHaveTextContent(item3.name);
        });
    })
})
