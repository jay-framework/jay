import {MeasureOfChange, Reactive, } from '../lib';
import {ReactiveWithTracking, RunOrder} from './reactive-with-tracking';

describe('reactive', () => {
    describe('create state', () => {
        it('with a default value', () => {
            let reactive = new Reactive();
            let [state] = reactive.createState(12);

            expect(state()).toBe(12);
        });

        it('with a getter function', () => {
            let reactive = new Reactive();
            let [state] = reactive.createState(() => 12);

            expect(state()).toBe(12);
        });

        it('should support state update with a value', () => {
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            setState(13);

            expect(state()).toBe(13);
        });

        it('should support state update with a function', () => {
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            setState((x) => x + 1);

            expect(state()).toBe(13);
        });

        it('should support state update as a reaction to another state change', async () => {
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(() => state() + 1);
            setState(20);

            await reactive.toBeClean();

            let res = state2();

            expect(res).toBe(21);
        });
    });

    describe('create reaction', () => {
        it('should run the reaction on creation', () => {
            const reaction = vi.fn();

            let reactive = new Reactive();
            reactive.createReaction(() => {
                reaction();
            });

            expect(reaction.mock.calls.length).toBe(1);
        });

        it('should rerun when it depends on state, and state changes', async () => {
            const reaction = vi.fn();
            let reactive = new Reactive();
            let [setState] = reactive.batchReactions(() => {
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
            const reaction = vi.fn();
            let reactive = new Reactive();
            let { setState2 } = reactive.batchReactions(() => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(100);
                reactive.createReaction(() => {
                    reaction(state());
                });
                return { setState2 };
            });

            setState2(101);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        });

        it('should not rerun when state it depends on is updated with the same immutable (===) value', () => {
            const reaction = vi.fn();
            let reactive = new Reactive();
            let { setState } = reactive.batchReactions(() => {
                let [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state());
                });
                return { setState };
            });

            setState(12);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        });
    });

    describe('batch reactions', () => {
        it('should batch re-calculations using the batch operation (single state)', () => {
            const reaction = vi.fn();
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            reactive.createReaction(() => {
                reaction(state());
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
            const reaction = vi.fn();
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(34);
            reactive.createReaction(() => {
                reaction(state() + state2());
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
            const reaction = vi.fn();
            let reactive = new Reactive();
            let [a, setA] = reactive.createState(false);
            let [b, setB] = reactive.createState('abc');
            let [c, setC] = reactive.createState('def');
            reactive.createReaction(() => {
                reaction(a(), b(), c());
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
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            reactive.createReaction(() => {
                state();
            });

            let res = reactive.batchReactions(() => {
                setState(13);
                return state();
            });

            expect(res).toBe(13);
        });

        it('should flatten out nested batchReactions', () => {
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12);
            reactive.createReaction(() => {
                reactive.batchReactions(() => {
                    setState((_) => _ + 1);
                });
                state();
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
            let reactive = new Reactive();
            let [state1, setState1] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(12);
            reactive.createReaction(() => {
                reactive.batchReactions(() => {
                    setState2(state1() + 10);
                });
            });

            setState1(13);
            await reactive.toBeClean();

            expect(state2()).toBe(23);
        });

        describe('should only run reactions that depend on updated states', () => {
            function makeReactive123() {
                let reactive = new Reactive();

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
            const reaction = vi.fn();
            let reactive = new Reactive();

            let [state, setState] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(24);
            reactive.createReaction(() => {
                reaction(state() + state2());
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
            const reaction = vi.fn();
            let reactive = new Reactive();

            let [state, setState] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(24);
            reactive.createReaction(() => {
                reaction(state() + state2());
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
            const reaction1 = vi.fn();
            const reaction2 = vi.fn();
            let reactive = new Reactive();

            let [state, setState] = reactive.createState(12);
            let [state2, setState2] = reactive.createState(24);
            reactive.createReaction(() => {
                reaction1(state());
            });
            reactive.createReaction(() => {
                reaction2(state2());
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
            const reaction2 = vi.fn();
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(1);
            let [state2, setState2] = reactive.createState(2);
            let [state3, setState3] = reactive.createState(3);
            let [state4, setState4] = reactive.createState(10);
            reactive.createReaction(() => {
                setState2(state() + 1);
            });
            reactive.createReaction(() => {
                setState3(state2() + 1);
            });
            reactive.createReaction(() => {
                reaction2(state3() + state4());
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

    describe('reactive measure of change', () => {
        function mkReactive() {
            const reaction = vi.fn();
            let reactive = new Reactive();
            let [state, setState] = reactive.createState(12, MeasureOfChange.FULL);
            let [state2, setState2] = reactive.createState(12, MeasureOfChange.PARTIAL);
            reactive.createReaction((measureOfChange) => {
                let num = state() + state2();
                reaction(num, measureOfChange);
                return state() + state2();
            });
            return { reactive, reaction, setState, setState2 };
        }
        it('should run initial reaction with MeasureOfChange.FULL', () => {
            const { setState, reactive, reaction } = mkReactive();

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][1]).toBe(MeasureOfChange.FULL);
        });

        it('should pass the MeasureOfChange.Full if state with MeasureOfChange.Full is changed', () => {
            const { setState, reactive, reaction } = mkReactive();

            reactive.batchReactions(() => {
                setState(22);
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[1][0]).toBe(34);
            expect(reaction.mock.calls[1][1]).toBe(MeasureOfChange.FULL);
        });

        it('should pass the MeasureOfChange.Partial if state with MeasureOfChange.Partial is changed', () => {
            const { setState2, reactive, reaction } = mkReactive();

            reactive.batchReactions(() => {
                setState2(22);
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[1][0]).toBe(34);
            expect(reaction.mock.calls[1][1]).toBe(MeasureOfChange.PARTIAL);
        });

        it('should pass the MeasureOfChange.Full if states with both MeasureOfChange.Partial and MeasureOfChange.Full are changed', () => {
            const { setState, setState2, reactive, reaction } = mkReactive();

            reactive.batchReactions(() => {
                setState(22);
                setState2(22);
            });

            expect(reaction.mock.calls.length).toBe(2);
            expect(reaction.mock.calls[1][0]).toBe(44);
            expect(reaction.mock.calls[1][1]).toBe(MeasureOfChange.FULL);
        });
    });

    describe('recalculate reaction dependencies on each reaction run', () => {
        const A = 'A';
        const B = 'B';
        function mkReactive() {
            let reactive = new Reactive();
            let [ABSwitch, setABSwitch] = reactive.createState('A');
            let [stateA1, setStateA1] = reactive.createState(10);
            let [stateA2, setStateA2] = reactive.createState(12);
            let [stateB1, setStateB1] = reactive.createState(110);
            let [stateB2, setStateB2] = reactive.createState(112);
            let [result, setResult] = reactive.createState(0);
            let [numberOfReactionRuns, setNumberOfReactionRuns] = reactive.createState(0);
            reactive.createReaction((measureOfChange) => {
                if (ABSwitch() === 'A') setResult(stateA1() + stateA2());
                else setResult(stateB1() + stateB2());
                setNumberOfReactionRuns((_) => _ + 1);
            });
            return {
                reactive,
                result,
                setABSwitch,
                setStateA1,
                setStateA2,
                setStateB1,
                setStateB2,
                numberOfReactionRuns,
            };
        }

        it('should run the A switch (validate setup)', () => {
            let { reactive, result, setABSwitch, setStateA1, setStateA2, numberOfReactionRuns } =
                mkReactive();

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            });

            expect(result()).toBe(9);
            expect(numberOfReactionRuns()).toBe(2);
        });

        it('should rerun the reaction when A state is updated', () => {
            let { reactive, result, setABSwitch, setStateA1, setStateA2, numberOfReactionRuns } =
                mkReactive();

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            });

            reactive.batchReactions(() => {
                setStateA1(5);
            });

            expect(result()).toBe(11);
            expect(numberOfReactionRuns()).toBe(3);
        });

        it('should not rerun the reaction when B states are updated after running for A switch', () => {
            let {
                reactive,
                result,
                setABSwitch,
                setStateA1,
                setStateA2,
                setStateB1,
                setStateB2,
                numberOfReactionRuns,
            } = mkReactive();

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            });

            reactive.batchReactions(() => {
                setStateB1(13);
                setStateB2(16);
            });

            expect(result()).toBe(9);
            expect(numberOfReactionRuns()).toBe(2);
        });

        it('should rerun the reaction when changing to B switch', () => {
            let {
                reactive,
                result,
                setABSwitch,
                setStateA1,
                setStateA2,
                setStateB1,
                setStateB2,
                numberOfReactionRuns,
            } = mkReactive();

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            });

            reactive.batchReactions(() => {
                setABSwitch(B);
                setStateB1(13);
                setStateB2(16);
            });

            expect(result()).toBe(29);
            expect(numberOfReactionRuns()).toBe(3);
        });

        it('should not rerun the reaction when changing to B switch and then updating A states', () => {
            let {
                reactive,
                result,
                setABSwitch,
                setStateA1,
                setStateA2,
                setStateB1,
                setStateB2,
                numberOfReactionRuns,
            } = mkReactive();

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            });

            reactive.batchReactions(() => {
                setABSwitch(B);
                setStateB1(13);
                setStateB2(16);
            });

            reactive.batchReactions(() => {
                setStateA1(23);
                setStateA2(26);
            });

            expect(result()).toBe(29);
            expect(numberOfReactionRuns()).toBe(3);
        });
    });

    describe('reactive pairing', () => {

        it(`A pulls from B. B batch sets B state. expecting to run A reactions`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(1);

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState('');
            A.createReaction(() => {
                setA1(`The B reactive Value is - ${b1()}`);
            });
            await A.toBeClean();
            await B.toBeClean();

            expect(a1()).toBe('The B reactive Value is - 1')

            B.batchReactions(() => {
                setB1(4);
            })

            expect(a1()).toBe('The B reactive Value is - 4')
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "A - createState A1",
                "A - i   : (B1) -> (A1)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "B - batch: setState B1",
                "B - flush!!!",
                "A - flush!!!",
                "A - i   : (B1) -> (A1)",
            ])
        })

        it(`A uses B. A batch, B batch sets B state. expecting to flush B on B batch end`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(1);
            const [b2, setB2] = B.createState('the length is 1');
            B.createReaction(() => {
                setB2(`the length is ${b1()}`);
            });

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState([1, 2, 3]);
            const [a2, setA2] = A.createState('');
            A.createReaction(() => {
                setA2(`${JSON.stringify(a1())} - ${b2()}`);
            });
            await A.toBeClean();
            await B.toBeClean();

            A.batchReactions(() => {
                setA1([1, 2, 3, 4]);
                B.batchReactions(() => {
                    setB1(a1().length);
                })
            })

            expect(a2()).toBe('[1,2,3,4] - the length is 4')
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "B - createState B2",
                "B - i   : (B1) -> (B2)",
                "A - createState A1",
                "A - createState A2",
                "A - i   : (A1,B2) -> (A2)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A - batch: setState A1",
                "A, B - batch: setState B1",
                "B - flush!!!",
                "B - i   : (B1) -> (B2)",
                "A - flush!!!",
                "A - i   : (A1,B2) -> (A2)",
            ])
        })

        it(`A uses B. A reaction sets B state without B Batch. expecting B to flush async then flush A again`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(3);
            const [b2, setB2] = B.createState('the length is 3');
            B.createReaction(() => {
                setB2(`the length is ${b1()}`);
            });

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState([1, 2, 3]);
            const [a2, setA2] = A.createState('');
            A.createReaction(() => {
                setB1(a1().length);
            });
            A.createReaction(() => {
                setA2(`${JSON.stringify(a1())} - ${b2()}`);
            });
            await A.toBeClean();
            await B.toBeClean();

            A.batchReactions(() => {
                setA1([1, 2, 3, 4]);
            })

            // `B` was not flushed yet, so the length is 3 and not 4
            expect(b2()).toBe('the length is 3')
            expect(a2()).toBe('[1,2,3,4] - the length is 3')
            await B.toBeClean();
            expect(b2()).toBe('the length is 4')
            expect(a2()).toBe('[1,2,3,4] - the length is 4')

            expect(runOrder.log).toEqual([
                "B - createState B1",
                "B - createState B2",
                "B - i   : (B1) -> (B2)",
                "A - createState A1",
                "A - createState A2",
                "A - i   : (A1) -> (B1)",
                "A - ii  : (A1,B2) -> (A2)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A - batch: setState A1",
                "A - flush!!!",
                "A - i   : (A1) -> (B1)",
                "A - ii  : (A1,B2) -> (A2)",
                "B - await toBeClean!!!",
                "B - flush!!!",
                "B - i   : (B1) -> (B2)",
                "A - flush!!!",
                "A - ii  : (A1,B2) -> (A2)",
            ])
        })

        it(`A pulls from B. A batch, B batch sets B state. expecting to run A reactions`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(1);

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState('');
            A.createReaction(() => {
                setA1(`The B reactive Value is - ${b1()}`);
            });
            await A.toBeClean();
            await B.toBeClean();

            expect(a1()).toBe('The B reactive Value is - 1')

            A.batchReactions(() => {
                B.batchReactions(() => {
                    setB1(4);
                })
            })

            expect(a1()).toBe('The B reactive Value is - 4')
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "A - createState A1",
                "A - i   : (B1) -> (A1)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A, B - batch: setState B1",
                "B - flush!!!",
                "A - flush!!!",
                "A - i   : (B1) -> (A1)",
            ])
        })

        it(`A pull from B. B batch sets B state. expecting to run A reactions`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(1);

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState('');
            A.createReaction(() => {
                setA1(`The B reactive Value is - ${b1()}`);
            });
            await A.toBeClean();
            await B.toBeClean();

            expect(a1()).toBe('The B reactive Value is - 1')

            B.batchReactions(() => {
                setB1(4);
            })

            expect(a1()).toBe('The B reactive Value is - 4')
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "A - createState A1",
                "A - i   : (B1) -> (A1)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "B - batch: setState B1",
                "B - flush!!!",
                "A - flush!!!",
                "A - i   : (B1) -> (A1)",
            ])
        })

        it(`A uses B. A updates B twice with batching. B flushes twice as a result`, async () => {

            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(3);
            const [b2, setB2] = B.createState(b1()+1);
            const [b3, setB3] = B.createState(5);
            const [b4, setB4] = B.createState(b3()+1);
            B.createReaction(() => {
                setB2(b1()+1);
            });
            B.createReaction(() => {
                setB4(b3()+1);
            });

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState(1);
            const [a2, setA2] = A.createState(b2()+1);
            A.createReaction(() => {
                B.batchReactions(() => {
                    setB1(a1()+1);
                })
            });
            A.createReaction(() => {
                setA2(b2()+1);
            });
            A.createReaction(() => {
                B.batchReactions(() => {
                    setB3(a2()+1); // this should fail and propagate to the batchReactions below
                })
            });

            await A.toBeClean();
            await B.toBeClean();

            A.batchReactions(() => {
                setA1(10);
            })
            expect(b4()).toEqual(15)
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "B - createState B2",
                "B - createState B3",
                "B - createState B4",
                "B - i   : (B1) -> (B2)",
                "B - ii  : (B3) -> (B4)",
                "A - createState A1",
                "A - createState A2",
                "A - i   : (A1) -> (B1)",
                "B - flush!!!",
                "B - i   : (B1) -> (B2)",
                "A - ii  : (B2) -> (A2)",
                "A - iii : (A2) -> (B3)",
                "B - flush!!!",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A - batch: setState A1",
                "A - flush!!!",
                "A - i   : (A1) -> (B1)",
                "B - flush!!!",
                "B - i   : (B1) -> (B2)",
                "A - ii  : (B2) -> (A2)",
                "A - iii : (A2) -> (B3)",
                "B - flush!!!",
                "B - ii  : (B3) -> (B4)",
            ])

        })

        it(`A uses B. A updates B using B batch, and expects on next reactions to have B flushed`, async () => {
            const runOrder = new RunOrder();
            const B = new ReactiveWithTracking('B', runOrder);
            const [b1, setB1] = B.createState(3);
            const [b2, setB2] = B.createState('the length is 3');
            B.createReaction(() => {
                setB2(`the length is ${b1()}`);
            });

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState([1, 2, 3]);
            const [a2, setA2] = A.createState('');
            const [a3, setA3] = A.createState(0);
            A.createReaction(() => {
                setA3(b1());
            });
            A.createReaction(() => {
                B.batchReactions(() => {
                    setB1(a1().length);
                })
            });
            A.createReaction(() => {
                setA2(`${JSON.stringify(a1())} - ${b2()}`);
            });

            await A.toBeClean();
            await B.toBeClean();

            A.batchReactions(() => {
                setA1([1, 2, 3, 4]);
            })

            expect(a3()).toBe(3) // not updated
            expect(b1()).toBe(4) // updated
            expect(a2()).toBe('[1,2,3,4] - the length is 4')
            expect(runOrder.log).toEqual([
                "B - createState B1",
                "B - createState B2",
                "B - i   : (B1) -> (B2)",
                "A - createState A1",
                "A - createState A2",
                "A - createState A3",
                "A - i   : (B1) -> (A3)",
                "A - ii  : (A1) -> (B1)",
                "B - flush!!!",
                "A - iii : (A1,B2) -> (A2)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A - batch: setState A1",
                "A - flush!!!",
                "A - ii  : (A1) -> (B1)",
                "B - flush!!!",
                "B - i   : (B1) -> (B2)",
                "A - iii : (A1,B2) -> (A2)",
            ])
        })

        it('should track getter of parent A reactive when read from child B reactive (createDerivedArray case)', async () => {
            const runOrder = new RunOrder();

            const A = new ReactiveWithTracking('A', runOrder);
            const [a1, setA1] = A.createState(1);
            const [a2, setA2] = A.createState(1);

            let B: Reactive;
            let b1, setB1
            A.createReaction(() => {
                if (!B) {
                    B = new ReactiveWithTracking('B', runOrder);
                    [b1, setB1] = B.createState(1);
                    B.createReaction(() => {
                        setB1(a1()+1)
                    })
                }
                else
                    B.flush();
            })
            A.createReaction(() => {
                setA2(b1()+1);
            })

            await A.toBeClean();
            await B.toBeClean();

            A.batchReactions(() => {
                setA1(10);
            })

            expect(b1()).toBe(11)
            expect(a2()).toBe(12)

            expect(runOrder.log).toEqual([
                "A - createState A1",
                "A - createState A2",
                "A - i   : () -> ()",
                "B - createState B1",
                "B - i   : (A1) -> (B1)",
                "A - ii  : (B1) -> (A2)",
                "A - await toBeClean!!!",
                "B - await toBeClean!!!",
                "A - batch: setState A1",
                "A - flush!!!",
                "A - i   : () -> ()",
                "B - flush!!!",
                "B - i   : (A1) -> (B1)",
                "A - ii  : (B1) -> (A2)",
                "B - flush!!!",
            ])
        })
    })
});
