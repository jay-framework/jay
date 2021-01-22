import {EoF, RandomAccessLinkedList} from "../../lib/random-access-linked-list";


export class TestList<T> extends RandomAccessLinkedList<T> {
    constructor(arr: Array<T>, matchBy: string) {
        super(arr, matchBy);
    }

    toArray(): Array<T> {
        let arr = [];
        let item = this.first();
        while (item !== EoF) {
            arr.push(item.value);
            item = item.next;
        }
        return arr;
    }

    clone() {
        return new TestList<T>(this.toArray(), this.matchBy);
    }
}