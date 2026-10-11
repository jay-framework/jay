/**
 * Built-in Error contract types (Design Log #218).
 *
 * These hand-written types are the type-only target that generated error pages import. A page
 * declaring `<script type="application/jay-headless" plugin="jay-stack" contract="error" key="error">`
 * compiles to `import { ErrorViewState, ErrorRefs, DetailOfErrorViewState } from
 * '@jay-framework/fullstack-component'`.
 *
 * IMPORTANT — keep in sync with `ERROR_CONTRACT` in
 * `packages/compiler/compiler-jay-html/lib/contract/builtin-contracts.ts`. The compiler test
 * `contract/builtin-error-contract.test.ts` locks the generated shape; if it changes, update
 * these types to match.
 */

/** One `{ key, value }` entry of the forEach-able `error.details` list. */
export interface DetailOfErrorViewState {
    key: string;
    value: string;
}

/** The error information injected into an error page under the `error` key. */
export interface ErrorViewState {
    status: number;
    title: string;
    message: string;
    url: string;
    /** Machine-readable error code (defaults to `''` when the outcome supplied none). */
    code: string;
    details: Array<DetailOfErrorViewState>;
}

/** Refs for the Error contract — it declares no interactive elements, so this is empty. */
export interface ErrorRefs {}

/** Repeated-context refs for the Error contract — empty for the same reason. */
export interface ErrorRepeatedRefs {}
