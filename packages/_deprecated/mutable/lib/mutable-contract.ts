export type ChangeListener = () => void;

export interface MutableContract {
    isMutable(): true;
    addMutableListener(changeListener: ChangeListener);
    removeMutableListener(changeListener: ChangeListener);
    getRevision(): number;
    setRevision(revNum: number);
    getOriginal();
    setOriginal(newOriginal): void;
    freeze();
}

export function isMutable(obj): obj is MutableContract {
    return typeof obj === 'object' && typeof obj.isMutable === 'function' && obj.isMutable();
}
