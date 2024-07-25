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

class ReactivePairing {
    flushOrigin?: Reactive
    paired = new Set<Reactive>()
    flushed = new Set<Reactive>()

    setOrigin(reactive: Reactive) {
        if (!this.flushOrigin)
            this.flushOrigin = reactive;
    }

    clearOrigin(reactive: Reactive) {
        if (this.flushOrigin === reactive) {
            this.flushOrigin = undefined;
            this.paired.clear();
            this.flushed.clear();
        }
    }

    flushPaired() {
        this.paired.forEach(reactive => {
            reactive.flush();
            this.flushed.add(reactive);
        })
        this.paired.clear();
    }

    addPaired(paired: Reactive) {
        if (this.flushOrigin) {
            if (this.flushed.has(paired))
                throw new Error('double reactive flushing')
            if (this.flushOrigin !== paired)
                this.paired.add(paired);
        }
    }
}
const REACTIVE_PAIRING = new ReactivePairing();

export class Reactive {
    private runningReactionIndex = undefined;
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

    createState<T>(
        value: ValueOrGetter<T>,
        measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
    ): [get: Getter<T>, set: Setter<T>] {
        let current: T;
        let reactionsToRerun: boolean[] = [];

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
            REACTIVE_PAIRING.addPaired(this);
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
                this.reactionDependencies[this.runningReactionIndex].add(resetDependency);
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

    private runReaction(reactionIndex: number, measureOfChange: MeasureOfChange) {
        this.reactionDependencies[reactionIndex].forEach((resetDependency) =>
            resetDependency(reactionIndex),
        );
        this.reactionDependencies[reactionIndex].clear();
        this.runningReactionIndex = reactionIndex;
        try {
            this.reactions[reactionIndex](measureOfChange);
        } finally {
            this.runningReactionIndex = undefined;
            REACTIVE_PAIRING.flushPaired();
        }
    }

    flush() {
        if (this.inFlush) return;
        this.inFlush = true;
        REACTIVE_PAIRING.setOrigin(this);
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
            REACTIVE_PAIRING.clearOrigin(this);
        }
    }
}

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise, resolve];
}
