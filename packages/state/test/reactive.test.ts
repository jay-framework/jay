import {describe, expect, it, jest} from '@jest/globals'
import {Reactive} from "../lib/reactive";

describe('reactive', () => {

    describe('create reactive', () => {
        it('should call the constructor function', () => {
            const myMock = jest.fn();

            new Reactive(() => {
                myMock()
            })

            expect(myMock.mock.calls.length).toBe(1);
        });
    });

    describe('create state', () => {
        it('create state with a default value', () => {
            let res;
            new Reactive((reactive) => {
                let [state, setState] = reactive.createState(12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('create state with a getter function', () => {
            let res;
            new Reactive((reactive) => {
                let [state, setState] = reactive.createState(() => 12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('should support createState state update with a value', () => {
            let res;
            new Reactive((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(13)
                res = state();
            })

            expect(res).toBe(13);
        });

        it('should support createState state update with a function', () => {
            let res;
            new Reactive((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(x => x+1)
                res = state();
            })

            expect(res).toBe(13);
        });
    });

    describe('create reaction', () => {
        it('should run the reaction on creation', () => {
            const myMock = jest.fn();

            new Reactive((reactive) => {
                reactive.createReaction(() => {
                    myMock()
                })
            })

            expect(myMock.mock.calls.length).toBe(1);
        })

        it('should rerun when it depends on state, and state changes', () => {
            const myMock = jest.fn();
            let state, setState
            new Reactive((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    myMock(state())
                })
            })

            setState(13);

            expect(myMock.mock.calls.length).toBe(2);
            expect(myMock.mock.calls[0][0]).toBe(12);
            expect(myMock.mock.calls[1][0]).toBe(13);
        })
    });
});
