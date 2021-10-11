

export type Next<T> = (t: T) => T
export type Setter<T> = (t: T | Next<T>) => T
export type Getter<T> = () => T
export function createState<T>(value: T | Getter<T>): [get: Getter<T>, set: Setter<T>] {
    let current = (typeof value === 'function')?(value as Getter<T>)():value;

    let update = (value: T| Next<T>) => {
        current = (typeof value === 'function')?(value as Next<T>)(current):value;
        return current;
    }

    return [() => current, update]
}

export function createReaction(func: () => void) {

}

export function createReactive(func: () => void) {
    try {
        func();
    }
    finally {

    }
}