
export const EoF = Symbol('EoF');
export const BoF = Symbol('BoF');

export interface LinkedListItem<T> {
    id: String,
    value: T,
    next: linkedListItem<T> | END,
    prev: linkedListItem<T> | START,
}

export class RandomAccessLinkedList<T> {
    constructor(arr: Array<T>, matchBy: String) {
        this._matchBy = matchBy;
        this._map = {};
        this._first = arr.reduceRight((nextItem, obj) => {
            let item = {id: obj[matchBy], value: obj}
            item.next = nextItem;
            item.prev = BoF;
            if (nextItem !== EoF)
                nextItem.prev = item;
            this._map[item.id] = item;
            return item;
        }, EoF)
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

    move(itemToMove: LinkedListItem<T>, toBefore:LinkedListItem<T>) {

    }

    remove(item: LinkedListItem<T>) {

    }

    add(obj: T, beforeItem: LinkedListItem<T>) {
        let newItem = {id: obj[this._matchBy], value: obj};
        newItem.next = beforeItem;
        if (beforeItem.prev === BoF)
            this._first = newItem;
        else
            beforeItem.prev.next = newItem;
    }

    distance(from: LinkedListItem<T>, to: LinkedListItem<T>) {
        let count = 0;
        while (from !== to && from !== EoF) {
            count++;
            from = from.next;
        }
        return from !== EoF?count: -1;
    }

}