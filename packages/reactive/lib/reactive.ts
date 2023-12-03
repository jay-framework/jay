export enum MeasureOfChange {
    NO_CHANGE,
    PARTIAL,
    FULL
}

export type Next<T> = (t: T) => T;
export type Setter<T> = (t: T | Next<T>) => T;
export type Getter<T> = () => T;
export type Reaction = (measureOfChange: MeasureOfChange) => void;
export type ValueOrGetter<T> = T | Getter<T>;
export const GetterMark = Symbol.for('getterMark');
export const SetterMark = Symbol.for('setterMark');

export class Reactive {
    private recording = false;
    private inCreateReaction = false;
    private batchedReactionsToRun: MeasureOfChange[] = [];
    private isAutoBatchScheduled = false;
    private reactionIndex = 0;
    private reactions: Array<Reaction> = [];
    private dirty: Promise<void> = Promise.resolve();
    private dirtyResolve: () => void;
    private timeout: any = undefined;
    private inBatchReactions: boolean;
    private inFlush: boolean;

    record<T>(func: (reactive: Reactive) => T): T {
        try {
            this.recording = true;
            return func(this);
        } finally {
            this.recording = false;
        }
    }

    createState<T>(value: ValueOrGetter<T>, measureOfChange: MeasureOfChange = MeasureOfChange.FULL): [get: Getter<T>, set: Setter<T>] {
        let current: T;
        let reactionsToRerun: boolean[] = [];

        const triggerReactions = () => {
            for (let index = 0; index < reactionsToRerun.length; index++) {
                if (reactionsToRerun[index]) {
                    if (this.recording) this.reactions[index](measureOfChange);
                    else if (!this.inBatchReactions) this.ScheduleAutoBatchRuns();
                    this.batchedReactionsToRun[index] = Math.max(measureOfChange, this.batchedReactionsToRun[index] || 0);
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

        let getter = () => {
            if (this.recording && this.inCreateReaction) {
                reactionsToRerun[this.reactionIndex] = true;
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
        this.reactions[this.reactionIndex] = func;
        this.inCreateReaction = true;
        try {
            func(MeasureOfChange.FULL);
        } finally {
            this.reactionIndex += 1;
            this.inCreateReaction = false;
        }
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

    flush() {
        if (this.inFlush) return;
        this.inFlush = true;
        try {
            for (let index = 0; index < this.batchedReactionsToRun.length; index++)
                if (this.batchedReactionsToRun[index]) this.reactions[index](this.batchedReactionsToRun[index]);
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
