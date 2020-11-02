
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
        this._last = BoF;
        this._first = arr.reduceRight((nextItem, obj) => {
            let item = {id: obj[matchBy], value: obj}
            item.next = nextItem;
            item.prev = BoF;
            if (nextItem !== EoF)
                nextItem.prev = item;
            if (this._last === BoF)
                this._last = item;
            this._map[item.id] = item;
            return item;
        }, EoF)
    }

    first(): LinkedListItem<T> {
        return this._first;
    }

    last(): LinkedListItem<T> {
        return this._last;
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
        delete this._map[this._matchBy];
        if (item.prev === BoF) {
            if (item.next !== EoF) {
                item.next.prev = BoF;
                this._first = item.next;
            }
            else {
                this._first = EoF;
                this._last = BoF;
            }
        }
        else if (item.next === EoF) {
            this._last = item.prev;
            item.prev.next = EoF;
        }
        else {
            item.prev.next = item.next;
            item.next.prev = item.prev;
        }         
    }

    add(obj: T, beforeItem: LinkedListItem<T> = EoF) {
        let newItem = {id: obj[this._matchBy], value: obj};
        this._map[newItem.id] = newItem;
        if (this._first === EoF && this._last === BoF) {
            this._first = newItem;
            this._last = newItem;
            newItem.prev = BoF;
            newItem.next = EoF;
        }
        else if (beforeItem === EoF) {
            newItem.next = EoF;
            this._last.next = newItem;
            newItem.prev = this._last;
            this._last = newItem;

        }
        else if (beforeItem === this._first) {
            newItem.next = beforeItem;
            this._first = newItem;
            beforeItem.prev = newItem;
            newItem.prev = BoF;
        }
        else {
            let itemBefore = beforeItem.prev;
            newItem.next = beforeItem;
            newItem.prev = itemBefore;
            itemBefore.next = newItem;
            beforeItem.prev = newItem;
        }
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