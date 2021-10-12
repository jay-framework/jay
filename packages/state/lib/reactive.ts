

export type Next<T> = (t: T) => T
export type Setter<T> = (t: T | Next<T>) => T
export type Getter<T> = () => T

export class Reactive {

    private recording = false;
    private recordingReaction = undefined;
    private batchedReactionsToRun: Set<() => void> = undefined;

    record(func: (reactive: Reactive) => void) {
        try {
            this.recording = true;
            func(this);
        }
        finally {
            this.recording = false;
        }
    }
    createState<T>(value: T | Getter<T>): [get: Getter<T>, set: Setter<T>] {
        let current = (typeof value === 'function') ? (value as Getter<T>)() : value;
        let reactionsToRerun = new Set<() => void>();

        let setter = (value: T | Next<T>) => {
            current = (typeof value === 'function') ? (value as Next<T>)(current) : value;
            reactionsToRerun.forEach(reaction => {
                if (this.batchedReactionsToRun)
                    this.batchedReactionsToRun.add(reaction)
                else
                    reaction()
            })
            return current;
        }

        let getter = () => {
            if (this.recording) {
                if (this.recordingReaction)
                    reactionsToRerun.add(this.recordingReaction)
            }
            return current;
        }

        return [getter, setter]
    }

    createReaction(func: () => void) {
        if (this.recording)
            this.recordingReaction = func;
        try {
            func();
        }
        finally {
            if (this.recording)
                this.recordingReaction = undefined;
        }
    }

    batchReactions(func: () => void) {
        this.batchedReactionsToRun = new Set();
        try {
            func();
        }
        finally {
            this.batchedReactionsToRun.forEach(reaction => reaction())
            this.batchedReactionsToRun = undefined;
        }
    }

}

