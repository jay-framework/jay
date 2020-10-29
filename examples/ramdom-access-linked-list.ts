
export const END = Symbol('END');

export interface LinkedListItem<T> {
    id: String,
    value: T,
    next: linkedListItem<T> | END
}

export class RandomAccessLinkedList<T> {
    constructor(arr: Array<T>, matchBy: String) {

    }

    first(): LinkedListItem<T> {

    }

    has(id: string): boolean {

    }

    get(id: string): LinkedListItem<T> {

    }

}