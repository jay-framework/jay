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
type ResetStateDependence = (reactionIndex: number) => void;

export class Reactive {
    private runningReactionIndex = undefined;
    private batchedReactionsToRun: MeasureOfChange[] = [];
    private isAutoBatchScheduled = false;
    private nextStateIndex: number = 0;
    private resetDependencyOnState: Array<ResetStateDependence> = [];
    private reactionIndex = 0;
    private reactions: Array<Reaction> = [];
    private reactionDependencies: Array<Set<number>> = [];
    private dirty: Promise<void> = Promise.resolve();
    private dirtyResolve: () => void;
    private timeout: any = undefined;
    private inBatchReactions: boolean;
    private inFlush: boolean;

    createState<T>(
        value: ValueOrGetter<T>,
        measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
    ): [get: Getter<T>, set: Setter<T>] {
        let current: T;
        let reactionsToRerun: boolean[] = [];
        let stateIndex = this.nextStateIndex++;

        const triggerReactions = () => {
            for (let index = 0; index < reactionsToRerun.length; index++) {
                if (reactionsToRerun[index]) {
                    if (!this.inBatchReactions) this.ScheduleAutoBatchRuns();
                    this.batchedReactionsToRun[index] = Math.max(
                        measureOfChange,
                        this.batchedReactionsToRun[index] || 0,
                    );
                }
            }
        };

        let setter = (value: T | Next<T>) => {
            let materializedValue =
                typeof value === 'function' ? (value as Next<T>)(current) : value;
            let isModified = materializedValue !== current;
            current = materializedValue;
            if (isModified) triggerReactions();
            return current;
        };

        let resetDependency: ResetStateDependence = (reactionIndex) => {
            reactionsToRerun[reactionIndex] = false;
        };

        let getter = () => {
            if (this.runningReactionIndex !== undefined) {
                reactionsToRerun[this.runningReactionIndex] = true;
                this.reactionDependencies[this.runningReactionIndex].add(stateIndex);
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
        this.resetDependencyOnState[stateIndex] = resetDependency;
        return [getter, setter];
    }

    createReaction(func: Reaction) {
        let reactionIndex = this.reactionIndex++;
        this.reactions[reactionIndex] = func;
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

    private runReaction(index: number, measureOfChange: MeasureOfChange) {
        this.reactionDependencies[index].forEach((stateIndex) =>
            this.resetDependencyOnState[stateIndex](index),
        );
        this.reactionDependencies[index].clear();
        this.runningReactionIndex = index;
        try {
            this.reactions[index](measureOfChange);
        } finally {
            this.runningReactionIndex = undefined;
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
            this.dirtyResolve();
        } finally {
            this.inFlush = false;
        }
    }
}

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise, resolve];
}
