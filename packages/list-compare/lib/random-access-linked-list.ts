
export const EoF = Symbol('EoF');
export const BoF = Symbol('BoF');

export interface LinkedListItem<T, S> {
    id: string,
    value: T,
    attach?: S,
    next: LinkedListItem<T, S> | typeof EoF,
    prev: LinkedListItem<T, S> | typeof BoF,
}

/**
 * hack for writing tests without typing, to reduce the need to cast items between LinkedListItem and BoF or EoF
 */
export interface UntypedRandomAccessLinkedList {
    first()
    last()
    get(id)
    has(id)
    add(obj, beforeItem, attach?)
    remove(item)
    move(itemToMove, toBefore)
    forEach(handler: (item, attach, index) => void)
}

export class RandomAccessLinkedList<T,S> implements UntypedRandomAccessLinkedList {
    private readonly _matchBy: string;
    private readonly _map: any;
    private _last: LinkedListItem<T, S> | typeof BoF;
    private _first: LinkedListItem<T,S> | typeof EoF;

    constructor(arr: Array<T>, matchBy: string) {       
        this._matchBy = matchBy;
        this._map = {};
        this._last = BoF;
        this._first = arr.reduceRight((nextItem: LinkedListItem<T,S> | typeof EoF, obj: T): LinkedListItem<T,S> | typeof EoF => {
            let item: LinkedListItem<T,S> = {id: obj[matchBy], value: obj, next: nextItem, prev: BoF};
            if (nextItem !== EoF)
                (nextItem as LinkedListItem<T,S>).prev = item;
            if (this._last === BoF)
                this._last = item;
            this._map[item.id] = item;
            return item;
        }, EoF)
    }

    first(): LinkedListItem<T,S> | typeof EoF {
        return this._first;
    }

    last(): LinkedListItem<T,S> | typeof BoF {
        return this._last;
    }

    has(id: string): boolean {
        return !!this._map[id]
    }

    get(id: string): LinkedListItem<T,S> {
        return this._map[id]
    }

    move(itemToMove: LinkedListItem<T,S>, toBefore:LinkedListItem<T,S>) {
        this.remove(itemToMove);
        this.add(itemToMove.value, toBefore, itemToMove.attach);
    }

    remove(item: LinkedListItem<T,S>) {
        delete this._map[this._matchBy];
        if (item.prev === BoF) {
            if (item.next !== EoF) {
                (item.next as LinkedListItem<T,S>).prev = BoF;
                this._first = item.next;
            }
            else {
                this._first = EoF;
                this._last = BoF;
            }
        }
        else if (item.next === EoF) {
            this._last = item.prev;
            (item.prev as LinkedListItem<T,S>).next = EoF;
        }
        else {
            (item.prev as LinkedListItem<T,S>).next = item.next;
            (item.next as LinkedListItem<T,S>).prev = item.prev;
        }         
    }

    forEach(handler: (value: T, attach: S, index: number) => void) {
        let listItem = this.first();
        let index = 0;
        while (listItem !== EoF) {
            handler(listItem.value, listItem.attach, index++);
            listItem = listItem.next;
        }
    }

    add(obj: T, beforeItem: LinkedListItem<T,S> | typeof EoF = EoF, attach: S = undefined) {
        let newItem: LinkedListItem<T,S>;
        if (this._first === EoF && this._last === BoF) {
            newItem = {id: obj[this._matchBy], value: obj, prev: BoF, next: EoF, attach};
            this._first = newItem;
            this._last = newItem;
        }
        else if (beforeItem === EoF) {
            newItem = {id: obj[this._matchBy], value: obj, prev: this._last, next: EoF, attach};
            (this._last as LinkedListItem<T,S>).next = newItem;
            this._last = newItem;

        }
        else if (beforeItem === this._first) {
            newItem = {id: obj[this._matchBy], value: obj, prev: BoF, next: beforeItem, attach};
            this._first = newItem;
            (beforeItem as LinkedListItem<T,S>).prev = newItem;
        }
        else {
            let itemBefore = (beforeItem as LinkedListItem<T,S>).prev as LinkedListItem<T,S>;
            newItem = {id: obj[this._matchBy], value: obj, prev: itemBefore, next: beforeItem, attach};
            itemBefore.next = newItem;
            (beforeItem as LinkedListItem<T,S>).prev = newItem;
        }
        this._map[newItem.id] = newItem;
    }

    distance(from: LinkedListItem<T,S> | typeof EoF, to: LinkedListItem<T,S>) {
        let count = 0;
        while (from !== to && from !== EoF) {
            count++;
            from = (from as LinkedListItem<T,S>).next;
        }
        return from !== EoF?count: -1;
    }

    get matchBy(): string {
        return this._matchBy
    }

}