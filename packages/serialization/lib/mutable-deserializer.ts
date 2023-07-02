import {mutableObject} from "jay-mutable/";
import {ARRAY, NOT_CHANGED, REVNUM} from "./serialize-consts";
import {setRevision} from "jay-reactive";
import {isMutable} from "jay-reactive";

export type Deserialize<T> = (serialized: string) => [T, Deserialize<T>]
export function deserialize<T extends object>(serialized: string): [T, Deserialize<T>] {
    return _deserialize(undefined)(serialized)
}

function update<T>(mutable: T, revivied: T) {
    let mutableInstance = isMutable(mutable)?mutable.getOriginal():mutable;
    // isMutable(mutable) && mutable.setRevision(revivied[REVNUM]);
    delete revivied[REVNUM]
    delete revivied[ARRAY]
    for (let key of Object.keys(revivied)) {
        let type = typeof revivied[key];
        if (revivied[key] === NOT_CHANGED)
            continue;
        switch (type) {
            case "string":
            case "number":
            case "bigint":
            case "boolean": {
                mutable[key] = revivied[key]
                break;
            }
            case "object": {
                if (mutable[key])
                    update(mutable[key], revivied[key])
                else
                    mutable[key] = revivied[key]
            }
        }
    }
    return mutable;
}

function deserializeObject<T extends object>(revivied: T, parentMutable: boolean) {
    if (typeof revivied === "object") {
        let revnum = revivied[REVNUM];
        delete revivied[REVNUM]
        if (revivied[ARRAY]) {
            delete revivied[ARRAY]
            revivied = Object.keys(revivied)
                .map((k) => deserializeObject(revivied[k], !!revnum)) as T;
        }
        else {
            for (let key of Object.keys(revivied)) {
                revivied[key] = deserializeObject(revivied[key], !!revnum);
            }
        }
        if (revnum) {
            setRevision(revivied, revnum);
            return !parentMutable?mutableObject(revivied):revivied;
        }
        return revivied
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
                revivied = deserializeObject(revivied, false)
                return [revivied, _deserialize(revivied)]
            }
        } else
            return [deserializeObject(revivied, false), _deserialize(mutable)]
    }
}
