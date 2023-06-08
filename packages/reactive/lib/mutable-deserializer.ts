import {_mutableObject} from "./mutable";
import {REVNUM} from "./serialize-consts";

type Deserialize = (mutable: any) => [string, Deserialize]
export function deserialize(mutable: string): [any, Deserialize] {
    let revivied = JSON.parse(mutable);
    if (revivied[REVNUM]) {
        let revnum = revivied[REVNUM]
        delete revivied[REVNUM]
        return [_mutableObject(revivied, undefined, revnum), deserialize]
    }
    else
        return [revivied, deserialize]
}