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
type Resolve = (value: void) => void;

const runningReactions: ReactiveGlobalKey[] = [];

function pushRunningReaction(reactiveGlobalKey: ReactiveGlobalKey) {
    runningReactions.push(reactiveGlobalKey);
}

function popRunningReaction() {
    runningReactions.pop();
}

export class Reactive {
    private batchedReactionsToRun: MeasureOfChange[] = [];
    private isAutoBatchScheduled = false;
    protected reactionIndex = 0;
    private reactions: Array<Reaction> = [];
    private reactionDependencies: Array<Set<ResetStateDependence>> = [];
    private dirty: Promise<void> = Promise.resolve();
    private dirtyResolve: Resolve;
    private timeout: any = undefined;
    protected inBatchReactions: boolean;
    private inFlush: boolean;
    private reactionGlobalKey: [Reactive, number][] = [];
    private reactivesToFlush: Set<Reactive> = new Set();
    private disabled = false;

    createSignal<T>(
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
                    this.triggerReaction(index, measureOfChange, false);
                }
            }
            pairedReactionsToRun.forEach(([reactive, index]) => {
                reactive.triggerReaction(index, measureOfChange, true);
                this.reactivesToFlush.add(reactive);
            });
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
            pairedReactionsToRun.delete(reactionGlobalKey);
        };

        const getter = () => {
            const runningReactionsLength = runningReactions.length;
            for (let index = runningReactionsLength - 1; index > -1; index--) {
                const [reactive, reactionIndex] = runningReactions[index];
                if (reactive === this) {
                    reactionsToRerun[reactionIndex] = true;
                    this.reactionDependencies[reactionIndex].add(resetDependency);
                    break;
                } else {
                    pairedReactionsToRun.add(runningReactions[index]);
                    reactive.reactionDependencies[reactionIndex].add(resetPairedDependency);
                }
            }
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

    protected triggerReaction(index: number, measureOfChange: MeasureOfChange, paired: boolean) {
        if (!this.inBatchReactions && !paired) this.ScheduleAutoBatchRuns();
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
        pushRunningReaction(this.reactionGlobalKey[reactionIndex]);
        try {
            this.reactions[reactionIndex](measureOfChange);
        } finally {
            popRunningReaction();
        }
    }

    flush() {
        if (this.inFlush || this.disabled) return;
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
            this.reactivesToFlush.forEach((reactive) => {
                if (!reactive.inBatchReactions) reactive.flush();
            });
            this.reactivesToFlush.clear();
        }
    }

    enable() {
        this.disabled = false;
        this.flush();
    }

    disable() {
        this.disabled = true;
    }
}

function mkResolvablePromise(): [Promise<void>, Resolve] {
    let resolve: Resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise as Promise<void>, resolve];
}

let _mkReactive = (...reactiveNames: (string | number)[]) => new Reactive()
export function setMkReactive(mkReactive: (...reactiveNames: (string | number)[]) => Reactive) {
    _mkReactive = mkReactive;
}
export function mkReactive(...reactiveNames: (string | number)[]) {
    return _mkReactive(...reactiveNames);
}