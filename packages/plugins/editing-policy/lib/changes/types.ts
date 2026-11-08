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
    /** Short human-readable description. */
    summary: string;
}

/** A project tree as a map of root-relative POSIX path → file contents. */
export type Tree = Map<string, string>;
