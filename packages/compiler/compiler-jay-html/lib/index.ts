export { type JayHtmlSourceFile } from './jay-target/jay-html-source-file';
export { generateElementDefinitionFile, generateElementFile } from './jay-target/jay-html-compiler';
export { generateElementFileReactTarget } from './react-target/jay-html-compiler-react';
export { generateElementBridgeFile, generateSandboxRootFile } from './jay-target/jay-html-compiler';
export { parseJayFile, getJayHtmlImports } from './jay-target/jay-html-parser';

export { renderRefsType } from './jay-target/jay-html-compile-refs';
export { generateTypes } from './jay-target/jay-html-compile-types';
export { parseIsEnum, parseEnumValues } from './expressions/expression-compiler';
export * from './contract';
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
    type HeadlessInstanceResolvedData,
} from './slow-render/slow-render-transform';
