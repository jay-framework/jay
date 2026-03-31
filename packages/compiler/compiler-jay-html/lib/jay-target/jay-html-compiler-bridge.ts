/**
 * Bridge/sandbox compilation target.
 * Extracted from jay-html-compiler.ts (Design Log #118).
 */
import {
    Import,
    Imports,
    isArrayType,
    JayImportLink,
    JayType,
    JayUnknown,
    mergeRefsTrees,
    mkRefsTree,
    nestRefs,
    Ref,
    RenderFragment,
    RuntimeMode,
} from '@jay-framework/compiler-shared';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import { parseAccessor, parseTextExpression, Variables } from '../expressions/expression-compiler';
import { JayHeadlessImports, JayHtmlNamespace } from './jay-html-source-file';
import { getComponentName, isForEach } from './jay-html-helpers';
import { Indent } from './indent';
import {
    optimizeRefs,
    ReferenceManagerTarget,
    RefNameGenerator,
    renderReferenceManager,
} from './jay-html-compile-refs';
import { processImportedComponents } from './jay-html-compile-imports';
import {
    filterContentNodes,
    isValidationError,
    textEscape,
    validateForEachAccessor,
} from './jay-html-compiler-shared';
import {
    type RenderContext,
    processImportedHeadless,
    renderChildCompProps,
    renderChildCompRef,
    renderElementRef,
} from './jay-html-compiler';

export function renderElementBridgeNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSymbols, indent } = context;

    function renderNestedComponent(
        htmlElement: HTMLElement,
        newContext: RenderContext,
        componentName: string,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let renderedRef = renderChildCompRef(htmlElement, newContext, componentName);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        return new RenderFragment(
            `${newContext.indent.firstLine}childComp(${componentName}, ${getProps}${renderedRef.rendered})`,
            Imports.for(Import.sandboxChildComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports),
            propsGetterAndRefs.validations,
            renderedRef.refs,
        );
    }

    function renderForEach(
        renderedForEach: RenderFragment,
        collectionVariables: Variables,
        trackBy: string,
        childElement: RenderFragment,
    ) {
        return new RenderFragment(
            `${indent.firstLine}forEach(${renderedForEach.rendered}, '${trackBy}', () => [
${childElement.rendered}
${indent.firstLine}])`,
            childElement.imports.plus(Import.sandboxForEach),
            [...renderedForEach.validations, ...childElement.validations],
            childElement.refs,
        );
    }

    function renderAsync(
        asyncType: 'resolved' | 'pending' | 'rejected',
        renderedAsync: RenderFragment,
        asyncVariables: Variables,
        childElement: RenderFragment,
    ) {
        const importMap = {
            resolved: Import.resolved,
            pending: Import.pending,
            rejected: Import.rejected,
        };

        return new RenderFragment(
            `${indent.firstLine}${asyncType}(${renderedAsync.rendered}, () => ${childElement.rendered.trim()})`,
            childElement.imports.plus(importMap[asyncType]),
            [...renderedAsync.validations, ...childElement.validations],
            childElement.refs,
            [...renderedAsync.recursiveRegions, ...childElement.recursiveRegions],
        );
    }

    function renderHtmlElement(htmlElement, newContext: RenderContext) {
        let childNodes = filterContentNodes(node.childNodes, true);

        let childIndent = newContext.indent.withFirstLineBreak();
        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) =>
                          renderElementBridgeNode(_, {
                              ...newContext,
                              indent: childIndent,
                          }),
                      )
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      );
        // Check for component (jay:ComponentName or legacy ComponentName syntax)
        const componentMatch = getComponentName(
            htmlElement.rawTagName,
            newContext.importedSymbols,
            newContext.headlessContractNames,
        );
        if (componentMatch !== null) {
            const componentName = componentMatch.name;
            if (componentMatch.kind === 'headless-instance') {
                // Headless component instances are not supported in sandbox mode
                return new RenderFragment('', Imports.none(), [], mkRefsTree([], {}));
            }
            return renderNestedComponent(
                htmlElement,
                { ...newContext, indent: childIndent },
                componentName,
            );
        } else {
            const renderedRef = renderElementRef(htmlElement, context);
            if (renderedRef.rendered !== '') {
                return new RenderFragment(
                    `${newContext.indent.firstLine}e(${renderedRef.rendered})`,
                    childRenders.imports.plus(Import.sandboxElement),
                    [...childRenders.validations, ...renderedRef.validations],
                    mergeRefsTrees(childRenders.refs, renderedRef.refs),
                );
            } else return childRenders;
        }
    }

    if (node.nodeType === NodeType.ELEMENT_NODE) {
        let htmlElement = node as HTMLElement;
        if (isForEach(htmlElement)) {
            const forEach = htmlElement.getAttribute('forEach');
            const trackBy = htmlElement.getAttribute('trackBy');

            const validated = validateForEachAccessor(forEach, variables);
            if (isValidationError(validated)) return validated;
            const { accessor: forEachAccessor, childVariables: forEachVariables } = validated;
            const forEachAccessPath = forEachAccessor.terms;

            const paramName = forEachAccessor.rootVar;
            const paramType = variables.currentType.name;
            const forEachFragment = forEachAccessor
                .render()
                .map((_) => `(${paramName}: ${paramType}) => ${_}`);
            let childElement = renderHtmlElement(htmlElement, {
                ...context,
                variables: forEachVariables,
                indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                dynamicRef: true,
            });
            return nestRefs(
                forEachAccessPath,
                renderForEach(forEachFragment, forEachVariables, trackBy, childElement),
            );
        } else return renderHtmlElement(htmlElement, context);
    }
    return RenderFragment.empty();
}

export function renderBridge(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    elementType: string,
    preRenderType: string,
    refsType: string,
    headlessImports: JayHeadlessImports[],
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        refNameGenerator: new RefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
        namespaces: [],
        importedRefNameToRef,
        recursiveRegions: [], // Initialize empty recursive regions stack
        isInsideGuard: false, // Not inside any guard initially
        insideFastForEach: false,
        usedComponentImports: new Set<string>(), // Not used for bridge
        headlessContractNames,
        headlessImports,
        headlessInstanceDefs: [], // Not used for bridge
        headlessInstanceCounter: { count: 0 },
        coordinatePrefix: [],
        coordinateCounters: new Map(),
    });
    renderedBridge = optimizeRefs(renderedBridge, headlessImports);

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedBridge.refs,
        ReferenceManagerTarget.elementBridge,
    );

    return new RenderFragment(
        `export function render(): ${preRenderType} {
${renderedRefsManager}
    const render = (viewState: ${types.name}) =>
        elementBridge(viewState, refManager, () => [${renderedBridge.rendered}
            ]) as ${elementType};
        return [refManager.getPublicAPI() as ${refsType}, render]
    }`,
        Imports.for(Import.sandboxElementBridge)
            .plus(renderedBridge.imports)
            .plus(Import.RenderElement)
            .plus(refsManagerImport),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}

export function renderSandboxRoot(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    headlessImports: JayHeadlessImports[],
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        refNameGenerator: new RefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
        namespaces: [],
        importedRefNameToRef,
        recursiveRegions: [], // Initialize empty recursive regions stack
        isInsideGuard: false, // Not inside any guard initially
        insideFastForEach: false,
        usedComponentImports: new Set<string>(), // Not used for sandbox
        headlessContractNames,
        headlessImports,
        headlessInstanceDefs: [], // Not used for sandbox
        headlessInstanceCounter: { count: 0 },
        coordinatePrefix: [],
        coordinateCounters: new Map(),
    });
    let refsPart =
        renderedBridge.rendered.length > 0
            ? `
${renderedBridge.rendered}
  `
            : '';

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedBridge.refs,
        ReferenceManagerTarget.sandboxRoot,
    );

    return new RenderFragment(
        `() => {
${renderedRefsManager}
        return [${refsPart}]
    }`,
        renderedBridge.imports.plus(refsManagerImport),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}
