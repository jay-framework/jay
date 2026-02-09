export type JayValidations = Array<string>;

export class WithValidations<Value> {
    val?: Value;
    validations: JayValidations;

    constructor(val: Value | undefined, validations: JayValidations = []) {
        this.val = val;
        this.validations = validations;
    }

    map<R>(func: (v: Value) => R): WithValidations<R> {
        if (this.val) return new WithValidations<R>(func(this.val), this.validations);
        else return new WithValidations<R>(undefined, this.validations);
    }

    async mapAsync<R>(func: (v: Value) => Promise<R>): Promise<WithValidations<R>> {
        if (this.val) {
            const result = await func(this.val);
            return new WithValidations<R>(result, this.validations);
        } else {
            return new WithValidations<R>(undefined, this.validations);
        }
    }

    flatMap<R>(func: (v: Value) => WithValidations<R>): WithValidations<R> {
        if (this.val) {
            let that = func(this.val);
            return new WithValidations<R>(that.val, [...this.validations, ...that.validations]);
        } else return new WithValidations<R>(undefined, this.validations);
    }

    async flatMapAsync<R>(
        func: (v: Value) => Promise<WithValidations<R>>,
    ): Promise<WithValidations<R>> {
        if (this.val) {
            const result = await func(this.val);
            return new WithValidations<R>(result.val, [...this.validations, ...result.validations]);
        } else {
            return new WithValidations<R>(undefined, this.validations);
        }
    }
    merge(other: WithValidations<Value>, merge: (t1: Value, t2: Value) => Value) {
        return new WithValidations(merge(this.val, other.val), [
            ...this.validations,
            ...other.validations,
        ]);
    }

    /**
     * Append validations from another WithValidations without changing the value.
     * Useful for collecting validations from side-effect operations.
     */
    withValidationsFrom<T>(other: WithValidations<T>): WithValidations<Value> {
        return new WithValidations(this.val, [...this.validations, ...other.validations]);
    }

    /**
     * Merge an array of WithValidations into a single WithValidations containing an array of values.
     * All validations are collected.
     */
    static all<T>(items: WithValidations<T>[]): WithValidations<T[]> {
        const values = items.map((item) => item.val).filter((v): v is T => v !== undefined);
        const validations = items.flatMap((item) => item.validations);
        return new WithValidations(values, validations);
    }

    /**
     * Create a WithValidations with no validations (pure value).
     */
    static pure<T>(value: T): WithValidations<T> {
        return new WithValidations(value, []);
    }
}

export function checkValidationErrors<T>(withValidations: WithValidations<T>): T {
    const { validations } = withValidations;
    if (validations.length > 0) {
        throw new Error(validations.join('\n'));
    }
    return withValidations.val!;
}
