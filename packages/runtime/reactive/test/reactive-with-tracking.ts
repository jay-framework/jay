import { Getter, MeasureOfChange, Next, Reaction, Reactive, Setter, ValueOrGetter } from '../lib';

export class RunOrder {
    log: string[] = [];
    private getStates: string[][] = [];
    private setStates: string[][] = [];
    private inReaction: number = -1;
    private batches: string[] = [];
    private reactionLogPosition: number[] = [];

    logReaction(
        reactive: string,
        reaction: string,
        readingStates: string[],
        settingStates: string[],
    ) {
        this.log.push(
            `${reactive} - ${reaction}: (${readingStates.join(',')}) -> (${settingStates.join(',')})`,
        );
    }

    logReady() {
        this.log.push('-- setup complete --');
    }

    logStartBatch(reactive: string) {
        this.log.push(`${reactive} - start batch `);
    }

    logExternalSetState(reactive: string, state: string) {
        this.log.push(`${reactive} -   external set state ${state} `);
    }

    logEndBatch(reactive: string) {
        this.log.push(`${reactive} - end batch `);
    }

    logGetState(name: string) {
        if (this.inReaction > -1) this.getStates[this.inReaction].push(name);
    }
    logSetState(name: string) {
        if (this.inReaction > -1) this.setStates[this.inReaction].push(name);
        else this.log.push(`${this.batches.join(', ')} - batch: setState ${name}`);
    }
    beforeReaction() {
        this.inReaction++;
        this.getStates[this.inReaction] = [];
        this.setStates[this.inReaction] = [];
        this.reactionLogPosition.push(this.log.length);
    }

    completeReaction(name: string, reactionName: string) {
        const reactionLogPosition = this.reactionLogPosition.pop();
        const logMessage = `${name} - ${reactionName}: (${this.getStates[this.inReaction].join(',')}) -> (${this.setStates[this.inReaction].join(',')})`;
        this.log.splice(reactionLogPosition, 0, logMessage);
        this.inReaction--;
    }

    beforeBatch(name: string) {
        this.batches.push(name);
    }

    completeBatch() {
        this.batches.pop();
    }

    flush(name: string) {
        this.log.push(`${name} - flush!!!`);
    }

    logToBeClean(name: string) {
        this.log.push(`${name} - await toBeClean!!!`);
    }
}

function romanNumbers(num: number) {
    switch (num) {
        case 1:
            return 'i   ';
        case 2:
            return 'ii  ';
        case 3:
            return 'iii ';
        case 4:
            return 'iv  ';
        case 5:
            return 'v   ';
        case 6:
            return 'vi  ';
        case 7:
            return 'vii ';
        case 8:
            return 'viii';
        case 9:
            return 'ix  ';
        case 10:
            return 'x   ';
    }
    return '' + num;
}

export class ReactiveWithTracking extends Reactive {
    stateIndex: number = 1;
    reactionNameIndex: number = 1;
    constructor(
        public readonly name: string,
        private runOrder: RunOrder,
    ) {
        super();
    }

    createSignal<T>(
        value: ValueOrGetter<T>,
        measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
    ): [get: Getter<T>, set: Setter<T>] {
        const stateName = this.name + this.stateIndex++;
        this.runOrder.log.push(`${this.name} - createSignal ${stateName}`);
        const [getter, setter] = super.createSignal(value, measureOfChange);
        const loggedSetter: Setter<T> = (value: T | Next<T>) => {
            this.runOrder.logSetState(stateName);
            return setter(value);
        };
        const loggedGetter: Getter<T> = () => {
            this.runOrder.logGetState(stateName);
            return getter();
        };
        return [loggedGetter, loggedSetter];
    }

    createReaction(func: Reaction) {
        const reactionName = romanNumbers(this.reactionNameIndex++);
        super.createReaction((measureOfChange) => {
            this.runOrder.beforeReaction();
            try {
                func(measureOfChange);
            } finally {
                this.runOrder.completeReaction(this.name, reactionName);
            }
        });
    }

    batchReactions<T>(func: () => T): T {
        this.runOrder.beforeBatch(this.name);
        try {
            return super.batchReactions(func);
        } finally {
            this.runOrder.completeBatch();
        }
    }

    flush() {
        this.runOrder.flush(this.name);
        super.flush();
    }

    toBeClean(): Promise<void> {
        this.runOrder.logToBeClean(this.name);
        return super.toBeClean();
    }
}
