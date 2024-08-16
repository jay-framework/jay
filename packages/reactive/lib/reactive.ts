export enum MeasureOfChange {
    // noinspection JSUnusedGlobalSymbols
    NO_CHANGE,
    PARTIAL,
    FULL,
}

export type Next<T> = (t: T) => T;
export type Setter<T> = (t: T | Next<T>) => T;
export type Getter<T> = () => T;
export type Reaction = (measureOfChange: MeasureOfChange) => void;
export type ValueOrGetter<T> = T | Getter<T>;
export const GetterMark = Symbol.for('getterMark');
export const SetterMark = Symbol.for('setterMark');
type ResetStateDependence = (reactionGlobalKey: ReactiveGlobalKey) => void;
type ReactiveGlobalKey = [Reactive, number];

class ReactivePairing {
    // origin?: Reactive
    // paired = new Set<Reactive>()
    // flushed = new Set<Reactive>()
    runningReactions: ReactiveGlobalKey[] = [];

    // setOrigin(reactive: Reactive) {
    //     if (!this.origin)
    //         this.origin = reactive;
    // }
    //
    // clearOriginAndFlushPaired(reactive: Reactive) {
    //     if (this.origin === reactive) {
    //         this.paired.forEach(reactive => {
    //             reactive.flush();
    //             this.flushed.add(reactive);
    //         })
    //         this.origin = undefined;
    //         this.paired.clear();
    //         this.flushed.clear();
    //     }
    // }
    //
    // addPaired(paired: Reactive) {
    //     if (this.origin) {
    //         if (this.flushed.has(paired))
    //             throw new Error('double reactive flushing')
    //         if (this.origin !== paired)
    //             this.paired.add(paired);
    //     }
    // }

    pushRunningReaction(reactiveGlobalKey: ReactiveGlobalKey) {
        this.runningReactions.push(reactiveGlobalKey)
    }

    popRunningReaction() {
        this.runningReactions.pop();
    }

    runningReaction(): ReactiveGlobalKey {
        return this.runningReactions.at(-1);
    }

    nestedRunningReaction(): ReactiveGlobalKey {
        return this.runningReactions.at(-2);
    }
}
const REACTIVE_PAIRING = new ReactivePairing();

export class Reactive {
    private batchedReactionsToRun: MeasureOfChange[] = [];
    private isAutoBatchScheduled = false;
    private reactionIndex = 0;
    private reactions: Array<Reaction> = [];
    private reactionDependencies: Array<Set<ResetStateDependence>> = [];
    private dirty: Promise<void> = Promise.resolve();
    private dirtyResolve: () => void;
    private timeout: any = undefined;
    private inBatchReactions: boolean;
    private inFlush: boolean;
    private reactionGlobalKey: [Reactive, number][] = [];
    private reactivesToFlush: Set<Reactive> = new Set()

    createState<T>(
        value: ValueOrGetter<T>,
        measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
    ): [get: Getter<T>, set: Setter<T>] {
        let current: T;
        // we can consolidate both ToRerun patterns.
        // however, the first is x100 times faster, and x100 times more in use
        // the second is more generic, yet slower
        const reactionsToRerun: boolean[] = [];
        let pairedReactionsToRun = new Set<ReactiveGlobalKey>();

        const triggerReactions = () => {
            for (let index = 0; index < reactionsToRerun.length; index++) {
                if (reactionsToRerun[index]) {
                    this.triggerReaction(index, measureOfChange);
                }
            }
            pairedReactionsToRun.forEach(([reactive, index]) => {
                reactive.triggerReaction(index, measureOfChange)
                this.reactivesToFlush.add(reactive)
            })
        };

        const setter = (value: T | Next<T>) => {
            let materializedValue =
                typeof value === 'function' ? (value as Next<T>)(current) : value;
            let isModified = materializedValue !== current;
            current = materializedValue;
            if (isModified) {
                triggerReactions();
            }
            return current;
        };

        const resetDependency: ResetStateDependence = (reactionGlobalKey) => {
            reactionsToRerun[reactionGlobalKey[1]] = false;
        };
        const resetPairedDependency: ResetStateDependence = (reactionGlobalKey) => {
            pairedReactionsToRun.delete(reactionGlobalKey)
        }

        const getter = () => {
            // const runningReaction = REACTIVE_PAIRING.runningReaction();
            // const nestedRunningReaction = REACTIVE_PAIRING.nestedRunningReaction();

            const runningReactionsLength = REACTIVE_PAIRING.runningReactions.length;
            for (let index = runningReactionsLength-1; index > -1; index--) {
                const [reactive, reactionIndex] = REACTIVE_PAIRING.runningReactions[index];
                if (reactive === this) {
                    reactionsToRerun[reactionIndex] = true;
                    this.reactionDependencies[reactionIndex].add(resetDependency);
                    break;
                }
                else {
                    pairedReactionsToRun.add(REACTIVE_PAIRING.runningReactions[index]);
                    reactive.reactionDependencies[reactionIndex].add(resetPairedDependency)
                }
            }

            // if (runningReaction) {
            //     const [reactive, reactionIndex] = runningReaction;
            //     if (reactive === this) {
            //         reactionsToRerun[reactionIndex] = true;
            //         this.reactionDependencies[reactionIndex].add(resetDependency);
            //     }
            //     else {
            //         pairedReactionsToRun.add(runningReaction);
            //         reactive.reactionDependencies[reactionIndex].add(resetPairedDependency)
            //     }
            // }
            return current;
        };

        if (typeof value === 'function') {
            this.createReaction(() => {
                let newValue = (value as Getter<T>)();
                setter(newValue);
            });
        } else setter(value);

        getter[GetterMark] = true;
        setter[SetterMark] = true;
        return [getter, setter];
    }

    private triggerReaction(index: number, measureOfChange: MeasureOfChange) {
        if (!this.inBatchReactions) this.ScheduleAutoBatchRuns();
        this.batchedReactionsToRun[index] = Math.max(
            measureOfChange,
            this.batchedReactionsToRun[index] || 0,
        );
    }

    createReaction(func: Reaction) {
        let reactionIndex = this.reactionIndex++;
        this.reactions[reactionIndex] = func;
        this.reactionGlobalKey[reactionIndex] = [this, reactionIndex];
        this.reactionDependencies[reactionIndex] = new Set();
        this.runReaction(reactionIndex, MeasureOfChange.FULL);
    }

    batchReactions<T>(func: () => T) {
        if (this.inBatchReactions || this.inFlush) return func();
        this.inBatchReactions = true;
        [this.dirty, this.dirtyResolve] = mkResolvablePromise();
        try {
            return func();
        } finally {
            this.flush();
            this.inBatchReactions = false;
            this.dirtyResolve();
        }
    }

    private ScheduleAutoBatchRuns() {
        if (!this.isAutoBatchScheduled) {
            this.isAutoBatchScheduled = true;
            [this.dirty, this.dirtyResolve] = mkResolvablePromise();
            this.timeout = setTimeout(() => {
                this.timeout = undefined;
                this.flush();
            }, 0);
        }
    }

    toBeClean(): Promise<void> {
        return this.dirty;
    }

    private runReaction(reactionIndex: number, measureOfChange: MeasureOfChange) {
        this.reactionDependencies[reactionIndex].forEach((resetDependency) =>
            resetDependency(this.reactionGlobalKey[reactionIndex]),
        );
        this.reactionDependencies[reactionIndex].clear();
        REACTIVE_PAIRING.pushRunningReaction(this.reactionGlobalKey[reactionIndex]);
        try {
            this.reactions[reactionIndex](measureOfChange);
        } finally {
            REACTIVE_PAIRING.popRunningReaction();
        }
    }

    flush() {
        if (this.inFlush) return;
        this.inFlush = true;
        try {
            for (let index = 0; index < this.batchedReactionsToRun.length; index++)
                if (this.batchedReactionsToRun[index])
                    this.runReaction(index, this.batchedReactionsToRun[index]);
            if (this.isAutoBatchScheduled) {
                this.isAutoBatchScheduled = false;
                if (this.timeout) clearTimeout(this.timeout);
                this.timeout = undefined;
            }
            this.batchedReactionsToRun = [];
            this.dirtyResolve && this.dirtyResolve();
        } finally {
            this.inFlush = false;
            this.reactivesToFlush.forEach(reactive => {
                if (!reactive.inBatchReactions) reactive.flush()
            })
            this.reactivesToFlush.clear();
        }
    }
}

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise, resolve];
}
