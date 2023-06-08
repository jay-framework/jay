import {_mutableObject, isMutable, originalSymbol} from "./mutable";
import {REVNUM} from "./serialize-consts";
import {REVISION, setRevision} from "./revisioned";

type Deserialize<T> = (serialized: string) => [T, Deserialize<T>]
export function deserialize<T extends object>(serialized: string): [T, Deserialize<T>] {
    return _deserialize(undefined)(serialized)
}

function update<T>(mutable: T, revivied: T) {
    let mutableInstance = isMutable(mutable)?mutable[originalSymbol]:mutable;
    setRevision(mutableInstance, revivied[REVNUM]);
    delete revivied[REVNUM]
    for (let key of Object.keys(revivied)) {
        let type = typeof revivied[key];
        switch (type) {
            case "string":
            case "number":
            case "bigint":
            case "boolean": {
                mutableInstance[key] = revivied[key]
                break;
            }
            case "object": {
                if (mutableInstance[key])
                    update(mutableInstance[key], revivied[key])
                else
                    mutableInstance[key] = revivied[key]
            }
        }
    }
    return mutable;
}

function deserializeRevNum<T extends object>(revivied: T) {
    setRevision(revivied, revivied[REVNUM]);
    delete revivied[REVNUM]
    for (let key of Object.keys(revivied)) {
        if (typeof revivied[key] === 'object')
            deserializeRevNum(revivied[key])
    }
}

function _deserialize<T extends object>(mutable: T): (serialized: string) => [T, Deserialize<T>] {
    return (serialized: string) => {
        let revivied: T = JSON.parse(serialized) as T;
        if (revivied[REVNUM]) {
            if (mutable) {
                return [update(mutable, revivied), _deserialize(mutable)];
            }
            else {
                deserializeRevNum(revivied)
                mutable = _mutableObject(revivied, undefined);
                return [mutable, _deserialize(mutable)]
            }
        } else
            return [revivied, _deserialize(mutable)]
    }
}
