// Change classification (DL#231 §6.3 step 2). A single file edit can produce several changes
// (e.g. a content edit in one section and a design edit elsewhere).

export type ChangeKind =
    | 'content'
    | 'design'
    | 'css'
    | 'code'
    | 'dependency'
    | 'config'
    | 'create'
    | 'delete'
    | 'rename'
    | 'policy'
    | 'sync';

export interface Change {
    kind: ChangeKind;
    /** Candidate-relative path (baseline path for a delete). */
    path: string;
    /** Baseline path for a rename. */
    fromPath?: string;
    /** For a `.jay-html` change attributed to a policy-marked part, the innermost marker name. */
    section?: string;
    /** 1-based [start, end] line range in the candidate file (set for section-scoped `.jay-html` changes). */
    lines?: [number, number];
    /** Short human-readable description. */
    summary: string;
}

/**
 * A project tree: file paths are known up front, contents are read on demand and NOT retained — so a
 * comparison never holds the whole project in memory, only the file(s) it is currently classifying.
 */
export interface Tree {
    /** Root-relative POSIX paths of every file in the tree. */
    paths(): string[];
    has(path: string): boolean;
    /** Read a file's contents on demand (uncached). Throws if the path is not in the tree. */
    read(path: string): string;
}

/** A {@link Tree} backed by an in-memory map — for tests and programmatic callers. */
export function treeFromMap(entries: Map<string, string> | Record<string, string>): Tree {
    const map = entries instanceof Map ? entries : new Map(Object.entries(entries));
    return {
        paths: () => [...map.keys()],
        has: (path) => map.has(path),
        read: (path) => {
            const content = map.get(path);
            if (content === undefined) throw new Error(`no such file in tree: ${path}`);
            return content;
        },
    };
}
