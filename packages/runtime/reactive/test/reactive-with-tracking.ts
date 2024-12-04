import { Getter, MeasureOfChange, Next, Reaction, Reactive, Setter, ValueOrGetter } from '../lib';

export class RunOrder {
    log: string[] = [];
    private getStates: string[][] = [];
    private setStates: string[][] = [];
    private scheduledReactions: string[][] = [];
    private inReaction: number = -1;
    private batches: string[] = [];
    private reactionLogPosition: number[] = [];
    private ident = '';
    private settingSignalFromBatch: string = '';

    logGetState(name: string) {
        if (this.inReaction > -1) this.getStates[this.inReaction].push(name);
    }
    logSetState(name: string) {
        if (this.inReaction > -1) this.setStates[this.inReaction].push(name);
        else {
            this.scheduledReactions[this.inReaction] = [];
            this.settingSignalFromBatch = name;
        }
    }

    logAfterSetState() {
        if (this.inReaction === -1) {
            const scheduledReactions = this.scheduledReactions[this.inReaction].join(',');
            this.log.push(
                `${this.ident}${this.batches.join(', ')} - batch: -> (${this.settingSignalFromBatch}) --> (${scheduledReactions})`,
            );
        }
    }

    beforeReaction() {
        this.inReaction++;
        this.getStates[this.inReaction] = [];
        this.setStates[this.inReaction] = [];
        this.scheduledReactions[this.inReaction] = [];
        this.reactionLogPosition.push(this.log.length);
        this.ident += '  ';
    }

    completeReaction(name: string, reactionName: string) {
        this.ident = this.ident.slice(0, -2);
        const reactionLogPosition = this.reactionLogPosition.pop();
        const signalGetters = this.getStates[this.inReaction].join(',');
        const signalSetters = this.setStates[this.inReaction].join(',');
        const scheduledReactions = this.scheduledReactions[this.inReaction].join(',');
        const logMessage = `${this.ident}${name} - ${reactionName}: (${signalGetters}) -> (${signalSetters}) --> (${scheduledReactions})`;
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
        this.log.push(`${this.ident}${name} - flush!!!`);
        this.ident += '  ';
    }

    flushEnd(name: string) {
        this.ident = this.ident.slice(0, -2);
        this.log.push(`${this.ident}${name} - flush end`);
    }

    logToBeClean(name: string) {
        this.log.push(`${this.ident}${name} - await toBeClean!!!`);
    }

    triggerReaction(name: string, index: number, scheduleAutoBatchRuns: boolean) {
        this.scheduledReactions[this.inReaction].push(
            `${name} - ${formatReactionName(index)}${scheduleAutoBatchRuns ? ' async' : ''}`,
        );
    }

    createSignal(name: string, stateName: string) {
        this.log.push(`${this.ident}${name} - createSignal ${stateName}`);
    }
}

const romanNumerals = {
    M: 1000,
    CM: 900,
    D: 500,
    CD: 400,
    C: 100,
    XC: 90,
    L: 50,
    XL: 40,
    X: 10,
    IX: 9,
    V: 5,
    IV: 4,
    I: 1,
};

function toRoman(num) {
    let roman = '';
    for (let i in romanNumerals) {
        while (num >= romanNumerals[i]) {
            roman += i;
            num -= romanNumerals[i];
        }
    }

    return roman;
}
function formatReactionName(num: number) {
    return toRoman(num + 1);
}

export class ReactiveWithTracking extends Reactive {
    stateIndex: number = 1;
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
        this.runOrder.createSignal(this.name, stateName);
        const [getter, setter] = super.createSignal(value, measureOfChange);
        const loggedSetter: Setter<T> = (value: T | Next<T>) => {
            this.runOrder.logSetState(stateName);
            const ret = setter(value);
            this.runOrder.logAfterSetState();
            return ret;
        };
        const loggedGetter: Getter<T> = () => {
            this.runOrder.logGetState(stateName);
            return getter();
        };
        return [loggedGetter, loggedSetter];
    }

    createReaction(func: Reaction) {
        const reactionName = formatReactionName(this.reactionIndex);
        super.createReaction((measureOfChange) => {
            this.runOrder.beforeReaction();
            try {
                func(measureOfChange);
            } finally {
                this.runOrder.completeReaction(this.name, reactionName);
            }
        });
    }

    triggerReaction(index: number, measureOfChange: MeasureOfChange, paired: boolean) {
        this.runOrder.triggerReaction(this.name, index, !this.inBatchReactions && !paired);
        super.triggerReaction(index, measureOfChange, paired);
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
        this.runOrder.flushEnd(this.name);
    }

    toBeClean(): Promise<void> {
        this.runOrder.logToBeClean(this.name);
        return super.toBeClean();
    }
}
