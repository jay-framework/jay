import { MeasureOfChange, Reactive } from '../lib';

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
            let {setState2} = reactive.batchReactions(() => {
                let [state, setState] = reactive.createState(12);
                let [state2, setState2] = reactive.createState(100);
                reactive.createReaction(() => {
                    reaction(state());
                });
                return {setState2}
            });

            setState2(101);

            expect(reaction.mock.calls.length).toBe(1);
            expect(reaction.mock.calls[0][0]).toBe(12);
        });

        it('should not rerun when state it depends on is updated with the same immutable (===) value', () => {
            const reaction = vi.fn();
            let reactive = new Reactive();
            let {setState} = reactive.batchReactions(() => {
                let [state, setState] = reactive.createState(12);
                reactive.createReaction(() => {
                    reaction(state());
                });
                return {setState};
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
                if (ABSwitch() === 'A')
                    setResult(stateA1() + stateA2());
                else
                    setResult(stateB1() + stateB2());
                setNumberOfReactionRuns(_ => _ + 1);
            });
            return { reactive, result, setABSwitch, setStateA1, setStateA2, setStateB1, setStateB2, numberOfReactionRuns};
        }

        it('should run the A switch (validate setup)', () => {
            let {reactive, result, setABSwitch, setStateA1,
                setStateA2, numberOfReactionRuns} = mkReactive()

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            })

            expect(result()).toBe(9)
            expect(numberOfReactionRuns()).toBe(2);
        })

        it('should rerun the reaction when A state is updated', () => {
            let {reactive, result, setABSwitch, setStateA1,
                setStateA2, numberOfReactionRuns} = mkReactive()

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            })

            reactive.batchReactions(() => {
                setStateA1(5);
            })

            expect(result()).toBe(11)
            expect(numberOfReactionRuns()).toBe(3);
        })

        it('should not rerun the reaction when B states are updated after running for A switch', () => {
            let {reactive, result, setABSwitch, setStateA1,
                setStateA2, setStateB1, setStateB2, numberOfReactionRuns} = mkReactive()

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            })

            reactive.batchReactions(() => {
                setStateB1(13);
                setStateB2(16);
            })

            expect(result()).toBe(9)
            expect(numberOfReactionRuns()).toBe(2);
        })

        it('should rerun the reaction when changing to B switch', () => {
            let {reactive, result, setABSwitch, setStateA1,
                setStateA2, setStateB1, setStateB2, numberOfReactionRuns} = mkReactive()

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            })

            reactive.batchReactions(() => {
                setABSwitch(B);
                setStateB1(13);
                setStateB2(16);
            })

            expect(result()).toBe(29)
            expect(numberOfReactionRuns()).toBe(3);
        })

        it('should not rerun the reaction when changing to B switch and then updating A states', () => {
            let {reactive, result, setABSwitch, setStateA1,
                setStateA2, setStateB1, setStateB2, numberOfReactionRuns} = mkReactive()

            reactive.batchReactions(() => {
                setABSwitch(A);
                setStateA1(3);
                setStateA2(6);
            })

            reactive.batchReactions(() => {
                setABSwitch(B);
                setStateB1(13);
                setStateB2(16);
            })

            reactive.batchReactions(() => {
                setStateA1(23);
                setStateA2(26);
            })

            expect(result()).toBe(29)
            expect(numberOfReactionRuns()).toBe(3);
        })
    })
});
