import {
    JayElement,
    ReferencesManager,
    ConstructContext,
    dynamicElement as de,
    element as e, dynamicText as dt, pending, rejected, resolved
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
            vi.waitFor(() => {
                expect(jayElement.dom.children).toHaveLength(1);
                expect(jayElement.dom.querySelector('#pending-div').innerHTML).toBe(STILL_LOADING);
            })
        });

        it('should render pending then resolved', async () => {
            const [resolve1, reject1, promise1] = mkPromise<string>();
            let jayElement = makeElement({ text1: promise1 });
            expect(jayElement.dom.children).toHaveLength(0);
            vi.waitFor(() => {
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
            vi.waitFor(() => {
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
})
