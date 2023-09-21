export type JayValidations = Array<string>;

export class WithValidations<Value> {
    val?: Value;
    validations: JayValidations;

    constructor(val: Value | undefined, validations: JayValidations) {
        this.val = val;
        this.validations = validations;
    }

    map<R>(func: (T) => R): WithValidations<R> {
        if (this.val) return new WithValidations<R>(func(this.val), this.validations);
        else return new WithValidations<R>(undefined, this.validations);
    }

    flatMap<R>(func: (T) => WithValidations<R>): WithValidations<R> {
        if (this.val) {
            let that = func(this.val);
            return new WithValidations<R>(that.val, [...this.validations, ...that.validations]);
        } else return new WithValidations<R>(undefined, this.validations);
    }

    merge(other: WithValidations<Value>, merge: (t1: Value, t2: Value) => Value) {
        return new WithValidations(merge(this.val, other.val), [
            ...this.validations,
            ...other.validations,
        ]);
    }
}
