import {_mutableObject, isMutable, originalSymbol} from "./mutable";
import {ARRAY, REVNUM} from "./serialize-consts";
import {REVISION, setRevision} from "./revisioned";

export type Deserialize<T> = (serialized: string) => [T, Deserialize<T>]
export function deserialize<T extends object>(serialized: string): [T, Deserialize<T>] {
    return _deserialize(undefined)(serialized)
}

function update<T>(mutable: T, revivied: T) {
    let mutableInstance = isMutable(mutable)?mutable[originalSymbol]:mutable;
    setRevision(mutableInstance, revivied[REVNUM]);
    delete revivied[REVNUM]
    delete revivied[ARRAY]
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

function deserializeObject<T extends object>(revivied: T) {
    if (typeof revivied === "object") {
        let revnum = revivied[REVNUM];
        delete revivied[REVNUM]
        if (revivied[ARRAY]) {
            delete revivied[ARRAY]
            let reviviedArray = Object.keys(revivied)
                .map((k) => deserializeObject(revivied[k]));
            setRevision(reviviedArray, revnum);
            return reviviedArray;
        }
        else {
            setRevision(revivied, revnum);
            for (let key of Object.keys(revivied)) {
                revivied[key] = deserializeObject(revivied[key]);
            }
            return revivied
        }
    }
    else
        return revivied;
}

function _deserialize<T extends object>(mutable: T): (serialized: string) => [T, Deserialize<T>] {
    return (serialized: string) => {
        let revivied: T = JSON.parse(serialized) as T;
        if (revivied[REVNUM]) {
            if (mutable) {
                return [update(mutable, revivied), _deserialize(mutable)];
            }
            else {
                revivied = deserializeObject(revivied)
                mutable = _mutableObject(revivied, undefined);
                return [mutable, _deserialize(mutable)]
            }
        } else
            return [revivied, _deserialize(mutable)]
    }
}
