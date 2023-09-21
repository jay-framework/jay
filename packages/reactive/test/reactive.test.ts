import { describe, expect, it, jest } from '@jest/globals';
import { Reactive } from '../lib';

describe('reactive', () => {
    describe('create reactive', () => {
        it('should call the constructor function', () => {
            const myMock = jest.fn();

            new Reactive().record(() => {
                myMock();
            });

            expect(myMock.mock.calls.length).toBe(1);
        });
    });

    describe('create state', () => {
        it('with a default value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state] = reactive.createState(12);
                res = state();
            });

            expect(res).toBe(12);
        });

        it('with a getter function', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state] = reactive.createState(() => 12);
                res = state();
            });

            expect(res).toBe(12);
        });

        it('should support state update with a value', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState(13);
                res = state();
            });

            expect(res).toBe(13);
        });

        it('should support state update with a function', () => {
            let res;
            new Reactive().record((reactive) => {
                let [state, setState] = reactive.createState(12);
                setState((x) => x + 1);
                res = state();
            });

            expect(res).toBe(13);
        });

        it('should support state update as a reaction to another state change', async () => {
            let reactive = new Reactive();
            let [setState, state2] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(() => state() + 1);
                return [setState, state2];
            });
            setState(20);

            await reactive.toBeClean();

            let res = state2();

            expect(res).toBe(21);
        });

        it('should support set state while recording, without adding additional dependencies', () => {
            let res;
            let reactive = new Reactive();
            let [state2] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(() => state() + 1);
                setState(20);
                return [state2];
            });
            res = state2();

            expect(res).toBe(21);
        });
    });

    describe('create reaction', () => {
        it('should run the reaction on creation', () => {
            const reaction = jest.fn();

            new Reactive().record((reactive) => {
                reactive.createReaction(() => {
                    reaction();
                });
            });

            expect(reaction.mock.calls.length).toBe(1);
        });

        it('should rerun when it depends on state, and state changes', async () => {
            const reaction = jest.fn();
            let reactive = new Reactive();
            let [setState] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state());
                });
                return [setState];
            });

            setState(13);
            await reactive.toBeClean();

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(12);
            expect(reaction.mock.calls[1][0]).toBe(13);
        });

        it('should not rerun when state it does not depends on changes', () => {
            const reaction = jest.fn();
            let state, setState;
            let state2, setState2;
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(100);
                reactive.createReaction(() => {
                    reaction(state());
                });
            });

            setState2(101);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        });

        it('should not rerun when state it depends on is updated with the same immutable (===) value', () => {
            const reaction = jest.fn();
            let state, setState;
            new Reactive().record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state());
                });
            });

            setState(12);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        });
    });

    describe('batch reactions', () => {
        it('should batch re-calculations using the batch operation (single state)', () => {
            const reaction = jest.fn();
            let state, setState;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state());
                });
            });

            expect(reaction.mock.calls.length).toBe(1);
            reactive.batchReactions(() => {
                setState(13);
                setState(14);
                expect(reaction.mock.calls.length).toBe(1);
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(12);
            expect(reaction.mock.calls[1][0]).toBe(14);
        });

        it('should run a reaction once even if multiple states it depends on are updated', () => {
            const reaction = jest.fn();
            let state, setState, state2, setState2;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                [state2, setState2] = reactive.createState(34);
                reactive.createReaction(() => {
                    reaction(state() + state2());
                });
            });

            expect(reaction.mock.calls.length).toBe(1);
            reactive.batchReactions(() => {
                setState(13);
                setState2(35);
                expect(reaction.mock.calls.length).toBe(1);
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(46);
            expect(reaction.mock.calls[1][0]).toBe(48);
        });

        it('should batch re-calculations using the batch operation (multiple states)', () => {
            const reaction = jest.fn();
            let a, b, c, setA, setB, setC;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [a, setA] = reactive.createState(false);
                [b, setB] = reactive.createState('abc');
                [c, setC] = reactive.createState('def');
                reactive.createReaction(() => {
                    reaction(a(), b(), c());
                });
            });

            reactive.batchReactions(() => {
                setA(true);
                setB('abcde');
                setC('fghij');
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(false);
            expect(reaction.mock.calls[0][1]).toBe('abc');
            expect(reaction.mock.calls[0][2]).toBe('def');
            expect(reaction.mock.calls[1][0]).toBe(true);
            expect(reaction.mock.calls[1][1]).toBe('abcde');
            expect(reaction.mock.calls[1][2]).toBe('fghij');
        });

        it('should return the value of the callback', () => {
            let state, setState;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    state();
                });
            });

            let res = reactive.batchReactions(() => {
                setState(13);
                return state();
            });

            expect(res).toBe(13);
        });

        it('should flatten out nested batchReactions', () => {
            let state, setState;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reactive.batchReactions(() => {
                        setState((_) => _ + 1);
                    });
                    state();
                });
            });

            let res = reactive.batchReactions(() => {
                setState(13);
                reactive.batchReactions(() => {
                    setState(14);
                });
                setState(15);
                return state();
            });

            expect(res).toBe(15);
        });

        it('should not trigger nested flash (first from timeout, second from batch reaction)', async () => {
            let state1, setState1;
            let state2, setState2;
            let reactive = new Reactive();
            reactive.record((reactive) => {
                [state1, setState1] = reactive.createState(12);
                [state2, setState2] = reactive.createState(12);
                reactive.createReaction(() => {
                    reactive.batchReactions(() => {
                        setState2(state1() + 10);
                    });
                });
            });

            setState1(13);
            await reactive.toBeClean();

            expect(state2()).toBe(23);
        });

        describe('should only run reactions that depend on updated states', () => {
            function makeReactive123() {
                let reactive = new Reactive();

                return reactive.record((reactive) => {
                    let reaction23 = 0,
                        reaction13 = 0,
                        reaction12 = 0;
                    let [state1, setState1] = reactive.createState(12);
                    let [state2, setState2] = reactive.createState(12);
                    let [state3, setState3] = reactive.createState(12);
                    reactive.createReaction(() => {
                        state2();
                        state3();
                        reaction23 += 1;
                    });
                    reactive.createReaction(() => {
                        state1();
                        state3();
                        reaction13 += 1;
                    });
                    reactive.createReaction(() => {
                        state1();
                        state2();
                        reaction12 += 1;
                    });

                    return {
                        update1: () =>
                            reactive.batchReactions(() => {
                                setState1(state1() + 1);
                            }),
                        update12: () =>
                            reactive.batchReactions(() => {
                                setState1(state1() + 1);
                                setState2(state2() + 1);
                            }),
                        update13: () =>
                            reactive.batchReactions(() => {
                                setState1(state1() + 1);
                                setState3(state3() + 1);
                            }),
                        update23: () =>
                            reactive.batchReactions(() => {
                                setState2(state2() + 1);
                                setState3(state3() + 1);
                            }),
                        data: () => ({ reaction23, reaction13, reaction12 }),
                    };
                });
            }

            it('only run reactions 12, 13, 23 when updating state 12', () => {
                let api = makeReactive123();
                api.update12();
                expect(api.data().reaction12).toBe(2);
                expect(api.data().reaction13).toBe(2);
                expect(api.data().reaction23).toBe(2);
            });

            it('only run reactions 12, 13 when updating state 1', () => {
                let api = makeReactive123();
                api.update1();
                expect(api.data().reaction12).toBe(2);
                expect(api.data().reaction13).toBe(2);
                expect(api.data().reaction23).toBe(1);
            });
        });
    });

    describe('auto batch reactions', () => {
        it('should auto batch re-calculations when not using batch operation', async () => {
            const reaction = jest.fn();
            let reactive = new Reactive();

            let [setState, setState2] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(24);
                reactive.createReaction(() => {
                    reaction(state() + state2());
                });
                return [setState, setState2];
            });
            setState(13);
            setState(14);
            setState2(25);

            await reactive.toBeClean();

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(36);
            expect(reaction.mock.calls[1][0]).toBe(39);
        });

        it('should flush pending auto batch re-calculations (when not using batch operation)', () => {
            const reaction = jest.fn();
            let reactive = new Reactive();

            let [setState, setState2] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(24);
                reactive.createReaction(() => {
                    reaction(state() + state2());
                });
                return [setState, setState2];
            });
            setState(13);
            setState(14);
            setState2(25);

            reactive.flush();

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[0][0]).toBe(36);
            expect(reaction.mock.calls[1][0]).toBe(39);
        });

        it('auto batched reactions should merge into batchReactions later call', () => {
            const reaction1 = jest.fn();
            const reaction2 = jest.fn();
            let reactive = new Reactive();

            let [setState, setState2] = reactive.record((reactive) => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(24);
                reactive.createReaction(() => {
                    reaction1(state());
                });
                reactive.createReaction(() => {
                    reaction2(state2());
                });
                return [setState, setState2];
            });
            setState(13);

            reactive.batchReactions(() => {
                setState2(25);
            });

            expect(reaction1.mock.calls.length).toBe(2);
            expect(reaction1.mock.calls[0][0]).toBe(12);
            expect(reaction1.mock.calls[1][0]).toBe(13);
            expect(reaction2.mock.calls.length).toBe(2);
            expect(reaction2.mock.calls[0][0]).toBe(24);
            expect(reaction2.mock.calls[1][0]).toBe(25);
        });
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
                });
                reactive.createReaction(() => {
                    setState3(state2() + 1);
                });
                reactive.createReaction(() => {
                    reaction2(state3() + state4());
                });
            });

            reactive.batchReactions(() => {
                setState4(20);
                setState(4);
            });

            expect(state2()).toBe(5);
            expect(state3()).toBe(6);
            expect(reaction2.mock.calls[1][0]).toBe(26);
        });
    });
});
