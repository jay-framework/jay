import { Minimatch } from 'minimatch';

/**
 * Match a project-root-relative path against a glob. Uses the `Minimatch` class (exported by both
 * minimatch v3 and v9) rather than the named `minimatch()` function (v9-only) — the release build can
 * resolve either version depending on hoisting. `new Minimatch(g).match(p)` is exactly what
 * `minimatch(p, g)` does.
 */
export function matchGlob(path: string, pattern: string): boolean {
    return new Minimatch(pattern, { dot: true }).match(path);
}
