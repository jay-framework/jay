import {EoF, RandomAccessLinkedList} from "../../lib/random-access-linked-list";


export class TestList<T, S> extends RandomAccessLinkedList<T, S> {
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
        let newList = new TestList<T, S>([], this.matchBy);
        let item = this.first();
        while (item !== EoF) {
            newList.add(item.value, EoF, item.attach);
            item = item.next;
        }
        return newList;
    }
}