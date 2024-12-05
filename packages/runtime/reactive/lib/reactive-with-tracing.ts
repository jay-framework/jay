import {
    Getter,
    MeasureOfChange,
    Next,
    Reaction,
    Reactive,
    setMkReactive,
    Setter,
    ValueOrGetter
} from '../lib';

export class ReactiveTracer {
    log: string[] = [];
    private getStates: Set<string>[] = [];
    private setStates: Set<string>[] = [];
    private scheduledReactions: Set<string>[] = [];
    private inReaction: number = -1;
    private batches: string[] = [];
    private reactionLogPosition: number[] = [];
    private ident = '';
    private settingSignalFromBatch: string = '';

    constructor(private flushToConsole: boolean = false) {}

    logGetState(name: string) {
        if (this.inReaction > -1) this.getStates[this.inReaction].add(name);
    }
    logSetState(name: string) {
        if (this.inReaction > -1) this.setStates[this.inReaction].add(name);
        else {
            this.scheduledReactions[this.inReaction] = new Set();
            this.settingSignalFromBatch = name;
        }
    }

    logAfterSetState() {
        if (this.inReaction === -1) {
            const scheduledReactions = [...this.scheduledReactions[this.inReaction]].sort().join(',');
            this.doLog(
                `${this.batches.join(', ')} - batch: -> (${this.settingSignalFromBatch}) --> (${scheduledReactions})`,
            );
        }
    }

    beforeReaction() {
        this.inReaction++;
        this.getStates[this.inReaction] = new Set();
        this.setStates[this.inReaction] = new Set();
        this.scheduledReactions[this.inReaction] = new Set();
        this.reactionLogPosition.push(this.log.length);
        this.ident += '  ';
    }

    completeReaction(name: string, reactionName: string) {
        this.ident = this.ident.slice(0, -2);
        const reactionLogPosition = this.reactionLogPosition.pop();
        const signalGetters = [...this.getStates[this.inReaction]].sort().join(',');
        const signalSetters = [...this.setStates[this.inReaction]].sort().join(',');
        const scheduledReactions = [...this.scheduledReactions[this.inReaction]].sort().join(',');
        const logMessage = `${this.ident}${name} - ${reactionName}: (${signalGetters}) -> (${signalSetters}) --> (${scheduledReactions})`;
        this.log.splice(reactionLogPosition, 0, logMessage);
        this.inReaction--;
        if (this.inReaction === -1)
            this.flushLog()
    }

    beforeBatch(name: string) {
        this.batches.push(name);
    }

    completeBatch() {
        this.batches.pop();
    }

    flush(name: string) {
        this.doLog(`${name} - flush!!!`);
        this.ident += '  ';
    }

    flushEnd(name: string) {
        this.ident = this.ident.slice(0, -2);
        this.doLog(`${name} - flush end`);
    }

    logToBeClean(name: string) {
        this.doLog(`${name} - await toBeClean!!!`);
    }

    triggerReaction(name: string, index: number, scheduleAutoBatchRuns: boolean) {
        this.scheduledReactions[this.inReaction].add(
            `${name} - ${formatReactionName(index)}${scheduleAutoBatchRuns ? ' async' : ''}`,
        );
    }

    createSignal(name: string, stateName: string) {
        this.doLog(`${name} - createSignal ${stateName}`);
    }

    doLog(message: string) {
        this.log.push(`${this.ident}${message}`);
        if (this.inReaction === -1)
            this.flushLog();
    }

    flushLog() {
        if (this.flushToConsole) {
            this.log.forEach(entry => console.debug(entry));
            this.log = [];
        }
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
        private reactiveTracer: ReactiveTracer,
    ) {
        super();
    }

    createSignal<T>(
        value: ValueOrGetter<T>,
        measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
    ): [get: Getter<T>, set: Setter<T>] {
        const stateName = this.name + this.stateIndex++;
        this.reactiveTracer.createSignal(this.name, stateName);
        const [getter, setter] = super.createSignal(value, measureOfChange);
        const loggedSetter: Setter<T> = (value: T | Next<T>) => {
            this.reactiveTracer.logSetState(stateName);
            const ret = setter(value);
            this.reactiveTracer.logAfterSetState();
            return ret;
        };
        const loggedGetter: Getter<T> = () => {
            this.reactiveTracer.logGetState(stateName);
            return getter();
        };
        return [loggedGetter, loggedSetter];
    }

    createReaction(func: Reaction) {
        const reactionName = formatReactionName(this.reactionIndex);
        super.createReaction((measureOfChange) => {
            this.reactiveTracer.beforeReaction();
            try {
                func(measureOfChange);
            } finally {
                this.reactiveTracer.completeReaction(this.name, reactionName);
            }
        });
    }

    triggerReaction(index: number, measureOfChange: MeasureOfChange, paired: boolean) {
        this.reactiveTracer.triggerReaction(this.name, index, !this.inBatchReactions && !paired);
        super.triggerReaction(index, measureOfChange, paired);
    }

    batchReactions<T>(func: () => T): T {
        this.reactiveTracer.beforeBatch(this.name);
        try {
            return super.batchReactions(func);
        } finally {
            this.reactiveTracer.completeBatch();
        }
    }

    flush() {
        this.reactiveTracer.flush(this.name);
        super.flush();
        this.reactiveTracer.flushEnd(this.name);
    }

    toBeClean(): Promise<void> {
        this.reactiveTracer.logToBeClean(this.name);
        return super.toBeClean();
    }
}

const globalReactiveTracer = new ReactiveTracer(true);
let runningNumber = 1;
function numberToAlphaNumeric(num) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";

    while (num > 0) {
        num--;
        result = alphabet[num % 26] + result;
        num = Math.floor(num / 26);
    }

    return result || "A";
}
setMkReactive((...reactiveNames: (string | number)[]) => {
    return new ReactiveWithTracking([numberToAlphaNumeric(runningNumber++), ...reactiveNames].join('-'), globalReactiveTracer)
})
