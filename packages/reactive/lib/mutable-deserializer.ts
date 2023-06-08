import {_mutableObject, originalSymbol} from "./mutable";
import {REVNUM} from "./serialize-consts";
import {REVISION} from "./revisioned";

type Deserialize<T> = (serialized: string) => [T, Deserialize<T>]
export function deserialize<T extends object>(serialized: string): [T, Deserialize<T>] {
    return _deserialize(undefined)(serialized)
}

function update<T>(mutable: T, revivied: T, revnum: number) {
    let mutableInstance = mutable[originalSymbol];
    mutableInstance[REVISION] = revnum;
    for (let key of Object.keys(revivied)) {
        let type = typeof revivied[key];
        switch (type) {
            case "string":
            case "number":
            case "bigint":
            case "boolean": {
                mutableInstance[key] = revivied[key]
            }
        }
    }
    return mutable;
}

function _deserialize<T extends object>(mutable: T): (serialized: string) => [T, Deserialize<T>] {
    return (serialized: string) => {
        let revivied: T = JSON.parse(serialized) as T;
        if (revivied[REVNUM]) {
            let revnum = revivied[REVNUM]
            if (mutable) {
                delete revivied[REVNUM]
                return [update(mutable, revivied, revnum), _deserialize(mutable)];
            }
            else {
                delete revivied[REVNUM]
                mutable = _mutableObject(revivied, undefined, revnum);
                return [mutable, _deserialize(mutable)]
            }
        } else
            return [revivied, _deserialize(mutable)]
    }
}
