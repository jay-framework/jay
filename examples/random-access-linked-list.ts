
export const END = Symbol('END');

export interface LinkedListItem<T> {
    id: String,
    value: T,
    next: linkedListItem<T> | END
}

export class RandomAccessLinkedList<T> {
    constructor(arr: Array<T>, matchBy: String) {
        this._map = {};
        this._first = arr.reduceRight((acc, item) => {
            let llItem = {id: item[matchBy], value: item}
            llItem.next = acc;
            this._map[llItem.id] = llItem;
            return llItem;
        }, END)
    }

    first(): LinkedListItem<T> {
        return this._first;
    }

    has(id: string): boolean {
        return !!this._map[id]
    }

    get(id: string): LinkedListItem<T> {
        return this._map[id]
    }

}