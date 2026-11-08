// Library entry: the pure policy engine (DL#231). No fs/git/network beyond reading the files passed
// to it. `comparePolicy` (baseline-vs-candidate) is added in P2.
export * from './policy/schema.js';
export { parsePolicy, PolicyParseError } from './policy/parse-policy.js';
export { checkPolicy } from './policy/check-policy.js';
export type { CheckPolicyContext } from './policy/check-policy.js';
export {
    parseSelector,
    selectorMatches,
    selectorSpecificity,
    compareSpecificity,
    SelectorParseError,
} from './policy/selector.js';
export type { ParsedSelector, ChangeTarget } from './policy/selector.js';
export { walkFiles, collectPolicyMarkers, policyMarkerNames } from './fs/scan-project.js';
export { classifyChanges, classifyModifiedFile } from './changes/classify.js';
export { classifyJayHtmlFile } from './changes/classify-jay-html.js';
export type { Change, ChangeKind, Tree } from './changes/types.js';
export { comparePolicy, PolicyToolError } from './compare/compare.js';
export type { ComparePolicyInput } from './compare/compare.js';
export { EXIT_CODES, EXIT_TOOL_ERROR } from './compare/types.js';
export type { CompareResult, Disposition, Finding } from './compare/types.js';
export { renderMarkdown, renderJson } from './report/render.js';
export type { RenderMeta } from './report/render.js';
export { readTree } from './fs/read-tree.js';
export { runCompareCli } from './bin/compare.js';
