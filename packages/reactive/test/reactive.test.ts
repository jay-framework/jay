import {describe, expect, it, jest} from '@jest/globals'
import {Reactive} from "../lib/reactive";
import {touchRevision} from '../lib/revisioned';

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
        it('with a default value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('with a getter function', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(() => 12);
                res = state();
            })

            expect(res).toBe(12);
        });

        it('should support state update with a value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(13)
                res = state();
            })

            expect(res).toBe(13);
        });

        it('should support state update with a function', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(x => x+1)
                res = state();
            })

            expect(res).toBe(13);
        });

        it('should support state update as a reaction to another state change', () => {
            let res;
            let state, setState, state2, setState2
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(() => state() + 1);
            })
            setState(20)
            res = state2();

            expect(res).toBe(21);
        })

        it('should support set state while recording, without adding additional dependencies', () => {
            let res;
            let state, setState, state2, setState2
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(() => state() + 1);
                setState(20)
            })
            res = state2();

            expect(res).toBe(21);
        })
    });

    describe('create reaction', () => {
        it('should run the reaction on creation', () => {
            const reaction = jest.fn();

            new Reactive().record((reactive) => {
                reactive.createReaction(() => {
                    reaction()
                })
            })

            expect(reaction.mock.calls.length).toBe(1);
        })

        it('should rerun when it depends on state, and state changes', () => {
            const reaction = jest.fn();
            let state, setState
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state())
                })
            })

            setState(13);

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(12);
            expect(reaction.mock.calls[1][0]).toBe(13);
        })

        it('should not rerun when state it does not depends on changes', () => {
            const reaction = jest.fn();
            let state, setState
            let state2, setState2
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(100);
                reactive.createReaction(() => {
                    reaction(state())
                })
            })

            setState2(101);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        })

        it('should not rerun when state it depends on is updated with the same immutable (===) value', () => {
            const reaction = jest.fn();
            let state, setState
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state())
                })
            })

            setState(12);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        })

        it('should not rerun when state it depends on is updated with the same mutable (same revision) value', () => {
            const reaction = jest.fn();
            let state, setState
            let value = touchRevision({name: 'abc'});
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(value);
                reactive.createReaction(() => {
                    reaction(state().name)
                })
            })
            value.name = 'def'
            setState(value);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe('abc');
        })

        it('should rerun when state it depends on is updated with updated mutable (different revision) value', () => {
            const reaction = jest.fn();
            let state, setState
            let value = touchRevision({name: 'abc'});
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(value);
                reactive.createReaction(() => {
                    reaction(state().name)
                })
            })
            value.name = 'def'
            touchRevision(value);
            setState(value);

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[1][0]).toBe('def');
        })
    });

    describe('batch reactions', () => {
        it('should batch re-calculations using the batch operation (single state)', () => {
            const reaction = jest.fn();
            let state, setState
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state())
                })
            })

            expect(reaction.mock.calls.length).toBe(1);
            reactive.batchReactions(() => {

                setState(13);
                setState(14);
                expect(reaction.mock.calls.length).toBe(1);
            })

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(12);
            expect(reaction.mock.calls[1][0]).toBe(14);
        })

        it('should run a reaction once even if multiple states it depends on are updated', () => {
            const reaction = jest.fn();
            let state, setState, state2, setState2;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(34);
                reactive.createReaction(() => {
                    reaction(state() + state2())
                })
            })

            expect(reaction.mock.calls.length).toBe(1);
            reactive.batchReactions(() => {

                setState(13);
                setState2(35);
                expect(reaction.mock.calls.length).toBe(1);
            })

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(46);
            expect(reaction.mock.calls[1][0]).toBe(48);
        })

        it('should batch re-calculations using the batch operation (multiple states)', () => {
            const reaction = jest.fn();
            let a, b, c, setA, setB, setC
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [a, setA] = reactive.createState(false);
                [b, setB] = reactive.createState('abc');
                [c, setC] = reactive.createState('def');
                reactive.createReaction(() => {
                    reaction(a(), b(), c())
                })
            })

            reactive.batchReactions(() => {
                setA(true);
                setB('abcde');
                setC('fghij');
            })

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(false);
            expect(reaction.mock.calls[0][1]).toBe('abc');
            expect(reaction.mock.calls[0][2]).toBe('def');
            expect(reaction.mock.calls[1][0]).toBe(true);
            expect(reaction.mock.calls[1][1]).toBe('abcde');
            expect(reaction.mock.calls[1][2]).toBe('fghij');
        })

    });

    describe('reaction ordering', () => {
        it('should run reactions in dependency order', () => {

            const reaction2 = jest.fn();
            let state, setState, state2, setState2, state3, setState3, state4, setState4;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(1);
                [state2, setState2] = reactive.createState(2);
                [state3, setState3] = reactive.createState(3);
                [state4, setState4] = reactive.createState(10);
                reactive.createReaction(() => {
                    setState2(state() + 1);
                })
                reactive.createReaction(() => {
                    setState3(state2() + 1)
                })
                reactive.createReaction(() => {
                    reaction2(state3() + state4())
                })
            })

            reactive.batchReactions(() => {
                setState4(20);
                setState(4);
            })

            expect(state2()).toBe(5)
            expect(state3()).toBe(6)
            expect(reaction2.mock.calls[1][0]).toBe(26)
        })
    })
});
