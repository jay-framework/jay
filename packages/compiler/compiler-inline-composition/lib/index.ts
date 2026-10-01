export {
    type NodePath,
    type Facet,
    type ChangeKind,
    type DiffEntry,
    type OverrideSpec,
    facetKey,
    overrideSpecFor,
    facetLabel,
} from './facet';
export {
    type Suppression,
    NO_SUPPRESSION,
    isMetaAttr,
    isRegionTag,
    isPageScope,
    readAttr,
    parseOverride,
    isSuppressed,
} from './override';
export { normalizeExpr, expressionsEqual } from './normalize';
export { parseInlineStyle, serializeInlineStyle } from './style';
export { diffMarkup, diffBodies } from './diff-markup';
export { diffCss } from './diff-css';
export {
    type LoadedTemplate,
    type MaterialiseOptions,
    type MaterialiseResult,
    materialise,
    mergeOverrides,
    scopeReadyCss,
    rootClassesOf,
} from './materialise';
