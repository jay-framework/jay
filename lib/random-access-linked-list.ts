
export const EoF = Symbol('EoF');
export const BoF = Symbol('BoF');

export interface LinkedListItem<T> {
    id: string,
    value: T,
    next: LinkedListItem<T> | typeof EoF,
    prev: LinkedListItem<T> | typeof BoF,
}

export class RandomAccessLinkedList<T> {
    private _matchBy: string;
    private _map: any;
    private _last: LinkedListItem<T> | typeof BoF;
    private _first: LinkedListItem<T> | typeof EoF;

    constructor(arr: Array<T>, matchBy: string) {
        this._matchBy = matchBy;
        this._map = {};
        this._last = BoF;
        this._first = arr.reduceRight((nextItem: LinkedListItem<T> | typeof EoF, obj: T): LinkedListItem<T> | typeof EoF => {
            let item: LinkedListItem<T> = {id: obj[matchBy], value: obj, next: nextItem, prev: BoF};
            if (nextItem !== EoF)
                (nextItem as LinkedListItem<T>).prev = item;
            if (this._last === BoF)
                this._last = item;
            this._map[item.id] = item;
            return item;
        }, EoF)
    }

    first(): LinkedListItem<T> | typeof EoF {
        return this._first;
    }

    last(): LinkedListItem<T> | typeof BoF {
        return this._last;
    }

    has(id: string): boolean {
        return !!this._map[id]
    }

    get(id: string): LinkedListItem<T> {
        return this._map[id]
    }

    move(itemToMove: LinkedListItem<T>, toBefore:LinkedListItem<T>) {
        this.remove(itemToMove);
        this.add(itemToMove.value, toBefore);
    }

    remove(item: LinkedListItem<T>) {
        delete this._map[this._matchBy];
        if (item.prev === BoF) {
            if (item.next !== EoF) {
                (item.next as LinkedListItem<T>).prev = BoF;
                this._first = item.next;
            }
            else {
                this._first = EoF;
                this._last = BoF;
            }
        }
        else if (item.next === EoF) {
            this._last = item.prev;
            (item.prev as LinkedListItem<T>).next = EoF;
        }
        else {
            (item.prev as LinkedListItem<T>).next = item.next;
            (item.next as LinkedListItem<T>).prev = item.prev;
        }         
    }

    add(obj: T, beforeItem: LinkedListItem<T> | typeof EoF = EoF) {
        let newItem: LinkedListItem<T>;
        if (this._first === EoF && this._last === BoF) {
            newItem = {id: obj[this._matchBy], value: obj, prev: BoF, next: EoF};
            this._first = newItem;
            this._last = newItem;
        }
        else if (beforeItem === EoF) {
            newItem = {id: obj[this._matchBy], value: obj, prev: this._last, next: EoF};
            (this._last as LinkedListItem<T>).next = newItem;
            this._last = newItem;

        }
        else if (beforeItem === this._first) {
            newItem = {id: obj[this._matchBy], value: obj, prev: BoF, next: beforeItem};
            this._first = newItem;
            (beforeItem as LinkedListItem<T>).prev = newItem;
        }
        else {
            let itemBefore = (beforeItem as LinkedListItem<T>).prev as LinkedListItem<T>;
            newItem = {id: obj[this._matchBy], value: obj, prev: itemBefore, next: beforeItem};
            itemBefore.next = newItem;
            (beforeItem as LinkedListItem<T>).prev = newItem;
        }
        this._map[newItem.id] = newItem;
    }

    distance(from: LinkedListItem<T> | typeof EoF, to: LinkedListItem<T>) {
        let count = 0;
        while (from !== to && from !== EoF) {
            count++;
            from = (from as LinkedListItem<T>).next;
        }
        return from !== EoF?count: -1;
    }

    get matchBy(): string {
        return this._matchBy
    }

}