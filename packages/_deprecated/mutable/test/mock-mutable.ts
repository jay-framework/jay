import {touchRevision} from "../lib/revisioned";
import {ChangeListener, MutableContract} from "jay-mutable-contract";


export function mockMutable<T extends object>(original: T): T & MutableContract {
    let mutableListener: ChangeListener = undefined;
    let revision: number = undefined;
    let m = new Proxy(original, {
        get(target: T, p: string | symbol, receiver: any): any {
            if (p === 'isMutable')
                return () => true;
            else if (p === 'addMutableListener')
                return (value: ChangeListener) => {
                    mutableListener = value;
                }
            else if (p === 'removeMutableListener')
                return () => {mutableListener = undefined}
            else if (p === 'getRevision')
                return () => {
                    return revision;
            }
            else if (p === 'setRevision')
                return (value: number) => {
                    revision = value;
                }
            let value = target[p];
            if (typeof value === 'object') {
                let m = mockMutable(value);
                m.addMutableListener(mutableListener);
                return m;
            }
            else
                return target[p]
        },
        set(target: T, p: string | symbol, value: any, receiver: any): boolean {
            target[p] = value;
            touchRevision(m)
            mutableListener && mutableListener();
            return true;
        }
    }) as T & MutableContract;

    return touchRevision(m)

}