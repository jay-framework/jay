export { type JayHtmlSourceFile } from './jay-target/jay-html-source-file';
export {
    generateElementDefinitionFile,
    generateElementFile,
    generateElementBridgeFile,
    generateElementHydrateFile,
    generateSandboxRootFile,
} from './jay-target/jay-html-compiler';
export { generateElementFileReactTarget } from './react-target/jay-html-compiler-react';
export {
    generateServerElementFile,
    type ServerElementOptions,
} from './jay-target/jay-html-compiler-server';
export {
    assignCoordinates,
    assignCoordinatesToJayHtml,
    type AssignCoordinatesOptions,
    type AssignCoordinatesResult,
} from './jay-target/assign-coordinates';
export {
    parseJayFile,
    getJayHtmlImports,
    injectHeadfullFSTemplates,
} from './jay-target/jay-html-parser';

export { renderRefsType } from './jay-target/jay-html-compile-refs';
export { htmlElementTagNameMap } from './jay-target/html-element-tag-name-map';
export { generateTypes } from './jay-target/jay-html-compile-types';
export { parseIsEnum, parseEnumValues } from './expressions/expression-compiler';
export * from './contract';
export * from './action';
export { type JayImportResolver } from './jay-target/jay-import-resolver';
export { JAY_IMPORT_RESOLVER } from './jay-target/jay-import-resolver';

// Slow rendering
export {
    slowRenderTransform,
    hasSlowPhaseProperties,
    discoverHeadlessInstances,
    resolveHeadlessInstances,
    type SlowRenderInput,
    type SlowRenderOutput,
    type HeadlessContractInfo,
    type DiscoveredHeadlessInstance,
    type ForEachHeadlessInstance,
    type HeadlessInstanceResolvedData,
    type HeadlessInstanceDiscoveryResult,
    buildInstanceCoordinateKey,
} from './slow-render/slow-render-transform';
