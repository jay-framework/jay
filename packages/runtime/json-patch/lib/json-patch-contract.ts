// Depth counter for recursion limit (supports up to depth 7)
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, ...0[]];

// Generate all valid paths as tuple types
type Paths<T, Depth extends number = 7> = Depth extends 0
    ? never
    : T extends object
        ? {
            [K in keyof T]: K extends string | number
                ? T[K] extends any[]
                    ?
                    | [K]
                    | [K, number]
                    | (T[K][number] extends object
                    ? [K, number, ...Paths<T[K][number], Prev[Depth]>]
                    : never)
                    : T[K] extends object
                        ? [K] | [K, ...Paths<T[K], Prev[Depth]>]
                        : [K]
                : never;
        }[keyof T]
        : never;

export const ADD = 'add' as const;
export const REPLACE = 'replace' as const;
export const REMOVE = 'remove' as const;
export const MOVE = 'move' as const;

// Use a helper to check if T is any/unknown and fall back to loose array type
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsUnknown<T> = unknown extends T ? (T extends unknown ? true : false) : false;

export type JSONPointer<T = unknown> = IsAny<T> extends true
    ? (string | number)[]
    : IsUnknown<T> extends true
        ? (string | number)[]
        : [T] extends [never]
            ? (string | number)[]
            : Paths<T> extends never
                ? (string | number)[]
                : Paths<T>;

export interface JSONPatchAdd<T = unknown> {
    op: typeof ADD;
    path: JSONPointer<T>;
    value: any;
}

export interface JSONPatchReplace<T = unknown> {
    op: typeof REPLACE;
    path: JSONPointer<T>;
    value: any;
}

export interface JSONPatchRemove<T = unknown> {
    op: typeof REMOVE;
    path: JSONPointer<T>;
}

export interface JSONPatchMove<T = unknown> {
    op: typeof MOVE;
    from: JSONPointer<T>;
    path: JSONPointer<T>;
}

export type JSONPatchOperation<T = unknown> = JSONPatchAdd<T> | JSONPatchReplace<T> | JSONPatchRemove<T> | JSONPatchMove<T>;
export type JSONPatch<T = unknown> = JSONPatchOperation<T>[];
