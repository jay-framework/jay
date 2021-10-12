import {describe, expect, it, jest} from '@jest/globals'
import {Reactive} from "../lib/reactive";

describe('reactive', () => {

    describe('create reactive', () => {
        it('should call the constructor function', () => {
            const myMock = jest.fn();

            new Reactive().record(() => {
                myMock()
            })

            expect(myMock.mock.calls.length).toBe(1);
        });
    });

    describe('create state', () => {
        it('create state with a default value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('create state with a getter function', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(() => 12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('should support createState state update with a value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(13)
                res = state();
            })

            expect(res).toBe(13);
        });

        it('should support createState state update with a function', () => {
            let res;
            new Reactive().record((reactive) => {
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

            new Reactive().record((reactive) => {
                reactive.createReaction(() => {
                    myMock()
                })
            })

            expect(myMock.mock.calls.length).toBe(1);
        })

        it('should rerun when it depends on state, and state changes', () => {
            const myMock = jest.fn();
            let state, setState
            new Reactive().record((reactive) => {
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

        it('should not rerun when state it does not depends on changes', () => {
            const myMock = jest.fn();
            let state, setState
            let state2, setState2
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(100);
                reactive.createReaction(() => {
                    myMock(state())
                })
            })

            setState2(101);

            expect(myMock.mock.calls.length).toBe(1);
            expect(myMock.mock.calls[0][0]).toBe(12);
        })

        it('should batch re-calculations using the batch operation (single state)', () => {
            const myMock = jest.fn();
            let state, setState
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    myMock(state())
                })
            })

            reactive.batchReactions(() => {

                setState(13);
                setState(14);
                expect(myMock.mock.calls.length).toBe(1);
            })

            expect(myMock.mock.calls.length).toBe(2);
            expect(myMock.mock.calls[0][0]).toBe(12);
            expect(myMock.mock.calls[1][0]).toBe(14);
        })

        it('should batch re-calculations using the batch operation (multiple states)', () => {
            const myMock = jest.fn();
            let a, b, c, setA, setB, setC
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [a, setA] = reactive.createState(false);
                [b, setB] = reactive.createState('abc');
                [c, setC] = reactive.createState('def');
                reactive.createReaction(() => {
                    myMock(a(), b(), c())
                })
            })

            reactive.batchReactions(() => {
                setA(true);
                setB('abcde');
                setC('fghij');
            })

            expect(myMock.mock.calls.length).toBe(2);
            expect(myMock.mock.calls[0][0]).toBe(false);
            expect(myMock.mock.calls[0][1]).toBe('abc');
            expect(myMock.mock.calls[0][2]).toBe('def');
            expect(myMock.mock.calls[1][0]).toBe(true);
            expect(myMock.mock.calls[1][1]).toBe('abcde');
            expect(myMock.mock.calls[1][2]).toBe('fghij');
        })

    });
});
