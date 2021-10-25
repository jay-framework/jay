

export type Next<T> = (t: T) => T
export type Setter<T> = (t: T | Next<T>) => T
export type Getter<T> = () => T

export class Reactive {

    private recording = false;
    private inCreateReaction = false;
    private batchedReactionsToRun: boolean[] = undefined;
    private reactionIndex = 0;
    private reactions: Array<() => void> = [];

    record<T>(func: (reactive: Reactive) => T): T {
        try {
            this.recording = true;
            return func(this);
        }
        finally {
            this.recording = false;
        }
    }
    createState<T>(value: T | Getter<T>): [get: Getter<T>, set: Setter<T>] {
        let current;
        let reactionsToRerun: boolean[] = [];

        let setter = (value: T | Next<T>) => {
            current = (typeof value === 'function') ? (value as Next<T>)(current) : value;
            for (let index = 0; index < reactionsToRerun.length; index++) {
                if (reactionsToRerun[index]) {
                    if (this.batchedReactionsToRun)
                        this.batchedReactionsToRun[index] = true;
                    else
                        this.reactions[index]();
                }
            }
            return current;
        }

        let getter = () => {
            if (this.recording && this.inCreateReaction) {
                reactionsToRerun[this.reactionIndex] = true;
            }
            return current;
        }

        if (typeof value === 'function') {
            this.createReaction(() => {
                let newValue = (value as Getter<T>)();
                setter(newValue);
            })
        }
        else
            current = value;

        return [getter, setter]
    }

    createReaction(func: () => void) {
        this.reactions[this.reactionIndex] = func;
        this.inCreateReaction = true;
        try {
            func();
        }
        finally {
            this.reactionIndex += 1;
            this.inCreateReaction = false;
        }
    }

    batchReactions(func: () => void) {
        this.batchedReactionsToRun = [];
        try {
            func();
        }
        finally {
            for (let index = 0; index < this.batchedReactionsToRun.length; index++)
                this.reactions[index]();
            this.batchedReactionsToRun = undefined;
        }
    }

}

