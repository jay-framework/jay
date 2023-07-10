export type ChangeListener = () => void;

export interface MutableContract {
    isMutable(): true
    addMutableListener(changeListener: ChangeListener)
    removeMutableListener(changeListener: ChangeListener)
    getRevision(): number
    setRevision(revNum: number)
    getOriginal(): object
    setOriginal(newOriginal): void
}

export function isMutable(obj): obj is MutableContract {
    return typeof obj === 'object' && typeof obj.isMutable === 'function' && obj.isMutable()
}