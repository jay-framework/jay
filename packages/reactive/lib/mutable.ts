import {touchRevision} from "./revisioned";


export function mutableArray<T>(arr: Array<T>): Array<T> {
    touchRevision(arr);
    return new Proxy(arr, {
        deleteProperty: function(target, property) {
            touchRevision(arr);
            delete target[property];
            console.log("Deleted %s", property);
            return true;
        },
        set: function(target, property, value) {
            target[property] = value;
            touchRevision(arr);
            console.log("Set", property, "to", value);
            return true;
        }
    });
}

export function mutableObject<T extends object>(obj: T): T {
    touchRevision(obj);
    return new Proxy(obj, {
        deleteProperty: function(target, property) {
            touchRevision(obj);
            delete target[property];
            console.log("Deleted %s", property);
            return true;
        },
        set: function(target, property, value) {
            target[property] = value;
            touchRevision(obj);
            console.log("Set", property, "to", value);
            return true;
        }
    });
}