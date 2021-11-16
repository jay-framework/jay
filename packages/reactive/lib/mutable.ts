import {touchRevision} from "./revisioned";


export function mutableObject<T extends object>(original: T, notifyParent?: () => void): T
export function mutableObject<T>(original: Array<T>, notifyParent?: () => void): Array<T> {
    touchRevision(original);
    const childRefs = new WeakMap();
    const childChanged = () => changed();
    const changed = () => {
        touchRevision(original)
        notifyParent?.();
    }
    return new Proxy(original, {
        deleteProperty: function(target, property) {
            delete target[property];
            changed();
            return true;
        },
        set: function(target, property, value) {
            target[property] = value;
            changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (typeof target[property] === 'object') {
                if (!childRefs.get(target[property]))
                    childRefs.set(target[property], mutableObject(target[property], childChanged))
                return childRefs.get(target[property])
            }
            else
                return target[property];
        }
    });
}