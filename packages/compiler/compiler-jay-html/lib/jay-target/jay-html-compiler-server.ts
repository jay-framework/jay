/** Server element compilation target. Extracted from jay-html-compiler.ts (Design Log #118). */

import {
    Import,
    Imports,
    JayErrorType,
    JayPromiseType,
    RenderFragment,
    WithValidations,
    computeInstanceKey,
    compileCoordinateExpr,
    isStaticCoordinate,
} from '@jay-framework/compiler-shared';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import {
    parseClassExpression,
    parseServerCondition,
    parseServerTemplateExpression,
    Variables,
} from '../expressions/expression-compiler';
import { camelCase } from '../case-utils';
import { Contract } from '../contract';
import { JayHeadlessImports, JayHtmlSourceFile } from './jay-html-source-file';
import {
    AsyncDirectiveTypes,
    checkAsync,
    ensureSingleChildElement,
    getComponentName,
    getSlowForEachInfo,
    isConditional,
    isForEach,
    isSlowForEach,
} from './jay-html-helpers';
import { generateTypes } from './jay-html-compile-types';
import { Indent } from './indent';
import { assignCoordinates } from './assign-coordinates';
import {
    BOOLEAN_ATTRIBUTE,
    COORD_ATTR,
    extractHeadlessCoordinate,
    filterContentNodes,
    isDirectiveAttribute,
    isValidationError,
    PROPERTY,
    propertyMapping,
    resolveHeadlessImport,
    textEscape,
    validateAsyncAccessor,
    validateForEachAccessor,
    validateSlowForEachAccessor,
} from './jay-html-compiler-shared';
import {
    buildInteractivePaths,
    conditionIsInteractive,
    textHasInteractiveBindings,
} from './jay-html-compiler-phase';

interface ServerContext {
    variables: Variables;
    indent: Indent;
    /** Contract names from headless imports (for <jay:contract-name> detection) */
    headlessContractNames: Set<string>;
    /** Full headless imports (for headless instance compilation) */
    headlessImports: JayHeadlessImports[];
    /** Counter for unique headless instance variable names */
    headlessInstanceCounter: { count: number };
    /** Variable mappings for compiling $placeholder coordinates inside forEach.
     *  Maps placeholder names to JS expressions, e.g. { _id: "vs1._id" }. */
    varMappings: Record<string, string>;
    /** Whether we're inside a forEach (affects instance key computation) */
    insideForEach: boolean;
    /** Whether we're inside a slowForEach (affects instance key computation) */
    insideSlowForEach: boolean;
    /** Property paths whose phase is 'fast+interactive' — only these need client adoption */
    interactivePaths: Set<string>;
    /** Accumulated JS expression for the full forEach coordinate prefix (all levels).
     *  Used to prefix static (positional) coords from nested forEach and for deeper nesting. */
    forEachAccumulatedPrefix?: string;
    /** JS expression for ancestor forEach prefix (all levels BEFORE the current forEach).
     *  Used to prefix dynamic ($-based) coords that already include the current trackBy. */
    forEachAncestorPrefix?: string;
    /** Concrete jayTrackBy value from an ancestor slow forEach item.
     *  Consumed by fast forEach handler to include in prefix computation. */
    slowForEachCoordPrefix?: string;
}

/**
 * Read pre-assigned coordinate from jay-coordinate-base attribute.
 * Returns a JS expression string for the coordinate value, or null if no coordinate.
 * Static coordinates return a quoted string literal.
 * Dynamic coordinates (with $placeholder) are compiled to string concatenation expressions.
 */
function getCoordinateExpr(element: HTMLElement, context: ServerContext): string | null {
    const template = element.getAttribute(COORD_ATTR);
    if (!template) return null;
    if (isStaticCoordinate(template)) {
        return `'${template}'`;
    }
    return compileCoordinateExpr(template, context.varMappings);
}

/** Helper: create a single-line w() statement as a RenderFragment */
function w(indent: Indent, code: string, imports: Imports = Imports.none()): RenderFragment {
    return new RenderFragment(`${indent.firstLine}w(${code});`, imports);
}

function renderServerNode(node: Node, context: ServerContext): RenderFragment {
    if (node.nodeType === NodeType.TEXT_NODE) {
        const text = node.innerText;
        if (text.trim() === '') return RenderFragment.empty();
        // Use template PEG rule to get raw accessor (no dt() wrapping)
        const [fragment, isDynamic] = parseServerTemplateExpression(
            textEscape(text),
            context.variables,
        );
        if (isDynamic) {
            return w(
                context.indent,
                `escapeHtml(String(${fragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            );
        }
        // Static text — fragment.rendered is already single-quoted
        return w(context.indent, fragment.rendered);
    }
    if (node.nodeType === NodeType.ELEMENT_NODE) {
        return renderServerElement(node as HTMLElement, context);
    }
    return RenderFragment.empty();
}

function renderServerElement(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables, indent } = context;

    // --- Headless component instance (<jay:contract-name>) ---
    // Must be checked BEFORE conditional, since a headless instance may have if= attribute
    // and renderServerHeadlessInstance handles the if= internally.
    const componentMatch = getComponentName(
        element.rawTagName,
        new Set(), // No headful component imports in server-element target
        context.headlessContractNames,
    );
    if (componentMatch !== null && componentMatch.kind === 'headless-instance') {
        return renderServerHeadlessInstance(element, context, componentMatch.name);
    }

    // --- Conditional (if=) ---
    if (isConditional(element)) {
        const condition = element.getAttribute('if');
        // Use condition PEG rule (raw expression, no arrow function wrapping)
        const renderedCondition = parseServerCondition(condition, variables);
        // Force coordinate assignment on conditional elements to keep the coordinate
        // counter aligned with the hydrate target (which always assigns coordinates
        // to conditionals). Without this, coordinates diverge after the first
        // conditional and hydration fails to adopt the correct elements.
        const body = renderServerElementContent(element, {
            ...context,
            indent: new Indent(indent.curr + '    '),
        });
        return new RenderFragment(
            `${indent.firstLine}if (${renderedCondition.rendered}) {\n${body.rendered}\n${indent.firstLine}}`,
            body.imports,
            body.validations,
        );
    }

    // --- forEach ---
    if (isForEach(element)) {
        const forEach = element.getAttribute('forEach');
        const trackBy = element.getAttribute('trackBy');

        const validated = validateForEachAccessor(forEach, variables);
        if (isValidationError(validated)) return validated;
        const { accessor: forEachAccessor, childVariables: forEachVariables } = validated;

        const arrayExpr = forEachAccessor.render().rendered;
        const itemIndent = new Indent(indent.curr + '    ');
        // Add trackBy variable mapping for $placeholder compilation in child coordinates.
        // Children inside forEach have jay-coordinate-base with $trackBy placeholders
        // (e.g. "$_id/0") that get compiled to runtime expressions using varMappings.
        const trackByExpr = `${forEachVariables.currentVar}.${trackBy}`;
        // Compute ancestor prefix: everything BEFORE this forEach (slow forEach prefix
        // and/or outer fast forEach prefix). Used to prefix dynamic child coordinates.
        const slowPrefix = context.slowForEachCoordPrefix
            ? `'${context.slowForEachCoordPrefix}'`
            : undefined;
        const ancestorPrefix = context.forEachAccumulatedPrefix ?? slowPrefix;
        // Accumulated prefix: ancestor + current trackBy. Used for static child coordinates
        // (from nested forEach) and for deeper nesting computation.
        const currentTrackByPrefix = `escapeAttr(String(${trackByExpr}))`;
        const accumulatedPrefix = ancestorPrefix
            ? `${ancestorPrefix} + '/' + ${currentTrackByPrefix}`
            : currentTrackByPrefix;
        const itemContext: ServerContext = {
            ...context,
            variables: forEachVariables,
            indent: itemIndent,
            varMappings: { ...context.varMappings, [trackBy]: trackByExpr },
            insideForEach: true,
            forEachAccumulatedPrefix: accumulatedPrefix,
            forEachAncestorPrefix: ancestorPrefix,
            slowForEachCoordPrefix: undefined, // consumed by ancestorPrefix computation
        };
        const openTag = renderServerOpenTag(element, itemContext, null);
        // Item root coordinate: includes accumulated prefix from ancestor forEach loops.
        const itemRootCoordExpr = accumulatedPrefix;
        const coordinateW = w(
            itemIndent,
            `' jay-coordinate="' + ${itemRootCoordExpr} + '">'`,
            Imports.for(Import.escapeAttr),
        );

        // Render children
        const childNodes = filterContentNodes(element.childNodes);
        const children = mergeServerFragments(
            childNodes.map((child) => renderServerNode(child, itemContext)),
        );
        const closeTag = w(itemIndent, `'</${element.rawTagName}>'`);

        const itemBody = mergeServerFragments([openTag, coordinateW, children, closeTag]);

        return new RenderFragment(
            `${indent.firstLine}for (const ${forEachVariables.currentVar} of ${arrayExpr}) {\n${itemBody.rendered}\n${indent.firstLine}}`,
            itemBody.imports,
            itemBody.validations,
        );
    }

    // --- slowForEach (pre-rendered slow-phase forEach items) ---
    if (isSlowForEach(element)) {
        const slowForEachInfo = getSlowForEachInfo(element);
        if (slowForEachInfo) {
            const { arrayName, jayIndex, jayTrackBy } = slowForEachInfo;
            const slowValidated = validateSlowForEachAccessor(arrayName, variables);
            if (isValidationError(slowValidated)) return slowValidated;
            const { accessor: arrayAccessor, childVariables: slowForEachVariables } = slowValidated;
            const arrayExpr = arrayAccessor.render().rendered;
            const itemVar = slowForEachVariables.currentVar;
            // Children inside slowForEach read their coordinates from jay-coordinate-base
            // (pre-assigned by assignCoordinates with jayTrackBy prefix, e.g. "p1/0").
            // Set slowForEachCoordPrefix so nested fast forEach can include it in prefix.
            const slowCoordPrefix = context.slowForEachCoordPrefix
                ? `${context.slowForEachCoordPrefix}/${jayTrackBy}`
                : jayTrackBy;
            const itemContext: ServerContext = {
                ...context,
                variables: slowForEachVariables,
                indent,
                insideSlowForEach: true,
                slowForEachCoordPrefix: slowCoordPrefix,
            };
            // Force jay-coordinate emission on slow forEach item root elements
            // so the hydrate code's adoptElement can resolve them (DL#115).
            const childContent = renderServerElementContent(element, itemContext, {
                isRoot: true,
            });
            // Only wrap with item variable lookup when the content actually references
            // the item variable (e.g., vs1). For slow-only arrays, the data may not be
            // in the SSR ViewState (it was consumed during slow render), so guarding
            // with `if (vs1)` would hide the pre-rendered content.
            const needsItemVar = childContent.rendered.includes(itemVar + '.');
            if (needsItemVar) {
                const itemIndent = new Indent(indent.curr + '    ');
                const indentedContext: ServerContext = {
                    ...context,
                    variables: slowForEachVariables,
                    indent: itemIndent,
                    insideSlowForEach: true,
                    slowForEachCoordPrefix: slowCoordPrefix,
                };
                const indentedContent = renderServerElementContent(element, indentedContext, {
                    isRoot: true,
                });
                return new RenderFragment(
                    `${indent.firstLine}{ const ${itemVar} = ${arrayExpr}?.[${jayIndex}]; if (${itemVar}) {\n${indentedContent.rendered}\n${indent.firstLine}}}`,
                    indentedContent.imports,
                    [...arrayAccessor.validations, ...indentedContent.validations],
                );
            }
            return childContent;
        }
    }

    // --- Async directives are handled by the parent's child processing ---
    // when-loading, when-resolved, when-rejected are never reached here
    // because renderServerElementContent groups them and handles them directly.

    // --- Regular element ---
    return renderServerElementContent(element, context);
}

/**
 * Render a headless component instance for the server-element target.
 * The inline template children are rendered directly (no wrapper element for <jay:xxx>)
 * using the instance's ViewState from `vs.__headlessInstances[coordinateKey]`.
 */
function renderServerHeadlessInstance(
    element: HTMLElement,
    context: ServerContext,
    contractName: string,
): RenderFragment {
    const { indent } = context;

    // Find the matching headless import
    const headlessResult = resolveHeadlessImport(contractName, context.headlessImports);
    if (isValidationError(headlessResult)) return headlessResult;
    const headlessImport = headlessResult;

    // Generate unique variable name for this instance's ViewState
    const idx = context.headlessInstanceCounter.count++;
    const varName = `vs_${contractName.replace(/-/g, '_')}${idx}`;
    const viewStateTypeName = headlessImport.rootType.name;

    // Read instance coordinate from pre-assigned jay-coordinate-base (DL#103)
    const coordResult = extractHeadlessCoordinate(element, contractName);
    if (isValidationError(coordResult)) return coordResult;
    const { instanceCoord, coordSegments, coordinateSuffix } = coordResult;

    // Compute __headlessInstances lookup key.
    // The key format depends on the context:
    //   static: just the suffix (e.g., "product-card:0")
    //   slowForEach: prefix/suffix (e.g., "p1/product-card:0")
    //   forEach: trackByValue,suffix (e.g., "1,product-card:0") — runtime expression
    let instanceKeyExpr: string;

    if (context.insideForEach) {
        // forEach: need trackBy expression from varMappings for comma-separated key.
        const trackByKeys = Object.keys(context.varMappings);
        const trackByExpr =
            trackByKeys.length > 0
                ? context.varMappings[trackByKeys[trackByKeys.length - 1]]
                : 'undefined';
        instanceKeyExpr = `String(${trackByExpr}) + ',${coordinateSuffix}'`;
    } else if (context.insideSlowForEach) {
        // slowForEach: key is trackByValue/suffix, skipping intermediate coordinate-bases.
        // coordSegments might be ["1", "0", "widget:AR0"] where "0" is a wrapper's
        // coordinate-base. Only the first segment (trackBy value) is the key prefix.
        const prefix = coordSegments[0];
        instanceKeyExpr = `'${computeInstanceKey(coordinateSuffix, 'slowForEach', prefix)}'`;
    } else {
        // Static instance: key is just the suffix, regardless of DOM nesting depth
        instanceKeyExpr = `'${computeInstanceKey(coordinateSuffix, 'static')}'`;
    }

    // Handle `if` condition on the <jay:xxx> tag — uses page ViewState (not instance's)
    const ifCondition = element.attributes.if;

    // Compile inline template children against the component's ViewState,
    // using the instance variable name so expressions resolve to vs_product_card0.name etc.
    const componentVariables = new Variables(headlessImport.rootType, undefined, 0, varName);
    const childNodes = filterContentNodes(element.childNodes);

    if (childNodes.length === 0) {
        return new RenderFragment('', Imports.none(), [
            `Headless component instance <jay:${contractName}> must have inline template content`,
        ]);
    }

    // Create a context for the inline template with the instance's ViewState.
    // Children read their own jay-coordinate-base — no coordinatePrefix needed.
    // Use the headless component's contract for interactivePaths — the widget's bindings
    // are resolved against the widget's contract, not the page's contract.
    const bodyIndent = ifCondition
        ? new Indent(indent.curr + '        ') // Inside if + if guard
        : new Indent(indent.curr + '    '); // Inside if guard only
    const instanceContext: ServerContext = {
        ...context,
        variables: componentVariables,
        indent: bodyIndent,
        // Pass headless contract names through so nested headless instances
        // inside headfull FS component templates can be detected (DL#123)
        headlessContractNames: context.headlessContractNames,
        interactivePaths: buildInteractivePaths(headlessImport.contract),
    };

    // Render inline template children.
    // Children have pre-assigned jay-coordinate-base from the pre-processor.
    // Multi-child wrapping was done by slow rendering or assignCoordinates.
    // The root child element must always emit jay-coordinate so the hydrate
    // target's adoptElement can find it and wire children (including refs).
    const renderedChildren = mergeServerFragments(
        childNodes.map((child) => {
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                return renderServerElementContent(child as HTMLElement, instanceContext, {
                    isRoot: true,
                });
            }
            return renderServerNode(child, instanceContext);
        }),
    );

    // Build the guarded block:
    //   const vs_pc0 = (vs as any).__headlessInstances?.[key] as Type | undefined;
    //   if (vs_pc0) { ... rendered children ... }
    const guardIndent = ifCondition ? new Indent(indent.curr + '    ') : indent;
    const guardedBlock = [
        `${guardIndent.firstLine}const ${varName} = (vs as any).__headlessInstances?.[${instanceKeyExpr}] as ${viewStateTypeName} | undefined;`,
        `${guardIndent.firstLine}if (${varName}) {`,
        renderedChildren.rendered,
        `${guardIndent.firstLine}}`,
    ].join('\n');

    // If there's an `if` condition, wrap in the page-level condition first
    let result: string;
    if (ifCondition) {
        const renderedCondition = parseServerCondition(ifCondition, context.variables);
        result = [
            `${indent.firstLine}if (${renderedCondition.rendered}) {`,
            guardedBlock,
            `${indent.firstLine}}`,
        ].join('\n');
    } else {
        result = guardedBlock;
    }

    return new RenderFragment(result, renderedChildren.imports, renderedChildren.validations);
}

/** Merge multiple server fragments, filtering out empty ones. */
function mergeServerFragments(fragments: RenderFragment[]): RenderFragment {
    return fragments
        .filter((f) => f.rendered.trim().length > 0)
        .reduce((prev, curr) => RenderFragment.merge(prev, curr, '\n'), RenderFragment.empty());
}

/**
 * Build the opening tag w() calls (tag name + attributes) as a RenderFragment.
 * coordinateClose: if non-null, append jay-coordinate and '>'; if null, just '>'.
 */
function renderServerOpenTag(
    element: HTMLElement,
    context: ServerContext,
    coordinateClose: string | null,
): RenderFragment {
    const parts: RenderFragment[] = [];
    parts.push(w(context.indent, `'<${element.rawTagName}'`));

    const attrs = renderServerAttributes(element, context);
    if (attrs.rendered.trim()) {
        parts.push(attrs);
    }

    // coordinateClose is appended by the caller for forEach (dynamic coordinate)
    // For regular elements, it's included here
    if (coordinateClose !== null) {
        parts.push(w(context.indent, `' jay-coordinate="${coordinateClose}">'`));
    }
    // If coordinateClose is null, caller handles closing the tag

    return mergeServerFragments(parts);
}

function renderServerAttributes(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables, indent } = context;
    const attributes = element.attributes;
    const parts: RenderFragment[] = [];

    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        if (isDirectiveAttribute(attrCanonical, 'data-jay-dynamic')) return;

        const attrValue = attributes[attrName];

        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue === '') {
                parts.push(w(indent, `' ${attrCanonical}'`));
            } else {
                // Use condition PEG rule (raw expression)
                const condExpr = parseServerCondition(attrValue, variables);
                parts.push(
                    new RenderFragment(
                        `${indent.firstLine}if (${condExpr.rendered}) { w(' ${attrCanonical}'); }`,
                    ),
                );
            }
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [fragment, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) {
                parts.push(
                    w(
                        indent,
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' ${attrCanonical}="${escaped}"'`));
            }
        } else if (attrCanonical === 'class') {
            // Class attribute — may have conditional class syntax like {bool1?main}
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) {
                // classExpression PEG wraps dynamic classes with da(vs => `...`).
                // Extract the template literal: strip "da(vs => " prefix and ")" suffix.
                const rawExpr = classExpr.rendered.replace(/^da\(\w+ => /, '').replace(/\)$/, '');
                parts.push(
                    w(
                        indent,
                        `' class="' + escapeAttr(String(${rawExpr})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' class="${escaped}"'`));
            }
        } else if (attrCanonical === 'style') {
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    w(
                        indent,
                        `' style="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' style="${escaped}"'`));
            }
        } else {
            // Regular attribute — use template PEG rule for raw accessor
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    w(
                        indent,
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' ${attrCanonical}="${escaped}"'`));
            }
        }
    });

    return mergeServerFragments(parts);
}

/** Void elements that don't have closing tags */
const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

/**
 * Render a server node as a string concatenation expression (for async template functions).
 * Instead of w() calls, returns string expressions like `'<span>' + escapeHtml(String(val)) + '</span>'`.
 */
function renderServerNodeAsString(node: Node, context: ServerContext): RenderFragment {
    if (node.nodeType === NodeType.TEXT_NODE) {
        const text = node.innerText;
        if (text.trim() === '') return RenderFragment.empty();
        const [fragment, isDynamic] = parseServerTemplateExpression(
            textEscape(text),
            context.variables,
        );
        if (isDynamic) {
            return new RenderFragment(
                `escapeHtml(String(${fragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            );
        }
        return new RenderFragment(fragment.rendered);
    }
    if (node.nodeType === NodeType.ELEMENT_NODE) {
        const el = node as HTMLElement;
        // Handle forEach inside template strings — use .map().join('')
        if (isForEach(el)) {
            return renderServerForEachAsString(el, context);
        }
        return renderServerElementAsString(el, context);
    }
    return RenderFragment.empty();
}

/**
 * Render a forEach element as a string expression using .map().join('').
 */
function renderServerForEachAsString(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables } = context;
    const forEach = element.getAttribute('forEach');

    const validated = validateForEachAccessor(forEach, variables);
    if (isValidationError(validated)) return validated;
    const { accessor: forEachAccessor, childVariables: forEachVariables } = validated;

    const arrayExpr = forEachAccessor.render().rendered;
    const itemContext: ServerContext = {
        ...context,
        variables: forEachVariables,
    };

    // Render the element content (not the forEach wrapper) as a string
    const itemContent = renderServerElementAsString(element, itemContext);

    return new RenderFragment(
        `${arrayExpr}.map((${forEachVariables.currentVar}) => ${itemContent.rendered}).join('')`,
        itemContent.imports,
        itemContent.validations,
    );
}

/**
 * Render a server element as a string concatenation expression (for async template functions).
 * Handles conditionals and forEach within resolved/rejected templates.
 */
function renderServerElementAsString(
    element: HTMLElement,
    context: ServerContext,
    overrideCoordinate?: string,
): RenderFragment {
    const { variables } = context;
    const refAttr = element.attributes.ref;
    const refName = refAttr ? camelCase(refAttr) : null;

    const childNodes = filterContentNodes(element.childNodes, true);

    // Determine coordinate
    let dynamicTextFragment: RenderFragment | null = null;
    if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const [fragment, isDynamic] = parseServerTemplateExpression(textEscape(text), variables);
        if (isDynamic) {
            dynamicTextFragment = fragment;
        }
    }

    const needsCoordinate =
        overrideCoordinate !== undefined ||
        dynamicTextFragment !== null ||
        refName !== null ||
        hasDynamicAttributeBindings(element, variables) ||
        hasInteractiveChildElements(childNodes) ||
        hasMixedContentDynamicText(childNodes);

    // Read pre-assigned coordinate from jay-coordinate-base
    const coordTemplate = element.getAttribute(COORD_ATTR);
    const coordinate = coordTemplate || (needsCoordinate ? overrideCoordinate || null : null);

    const isVoid = voidElements.has(element.rawTagName.toLowerCase());
    const closeTag = isVoid ? ' />' : '>';
    const stringParts: RenderFragment[] = [];

    // Opening tag
    stringParts.push(new RenderFragment(`'<${element.rawTagName}'`));

    // Attributes (rendered as string parts)
    const attrs = renderServerAttributesAsString(element, context);
    if (attrs.rendered.trim()) {
        stringParts.push(attrs);
    }

    if (coordinate !== null) {
        stringParts.push(new RenderFragment(`' jay-coordinate="${coordinate}"${closeTag}'`));
    } else {
        stringParts.push(new RenderFragment(`'${closeTag}'`));
    }

    if (!isVoid) {
        // Children
        if (dynamicTextFragment) {
            stringParts.push(
                new RenderFragment(
                    `escapeHtml(String(${dynamicTextFragment.rendered}))`,
                    Imports.for(Import.escapeHtml),
                ),
            );
        } else {
            for (const child of childNodes) {
                const childFragment = renderServerNodeAsString(child, context);
                if (childFragment.rendered.trim()) {
                    stringParts.push(childFragment);
                }
            }
        }

        // Closing tag
        stringParts.push(new RenderFragment(`'</${element.rawTagName}>'`));
    }

    // Join all parts with ' + '
    const filtered = stringParts.filter((f) => f.rendered.trim().length > 0);
    if (filtered.length === 0) return RenderFragment.empty();
    return filtered.reduce(
        (prev, curr) =>
            new RenderFragment(
                prev.rendered + ' + ' + curr.rendered,
                prev.imports.plus(curr.imports),
                [...prev.validations, ...curr.validations],
            ),
    );
}

/**
 * Render attributes as string parts for template string mode.
 * Returns a fragment like `' class="foo"' + ' href="' + escapeAttr(...) + '"'`
 */
function renderServerAttributesAsString(
    element: HTMLElement,
    context: ServerContext,
): RenderFragment {
    const { variables } = context;
    const attributes = element.attributes;
    const parts: RenderFragment[] = [];

    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        if (isDirectiveAttribute(attrCanonical, 'data-jay-dynamic')) return;

        const attrValue = attributes[attrName];

        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue === '') {
                parts.push(new RenderFragment(`' ${attrCanonical}'`));
            }
            // Dynamic boolean attributes in template strings are complex — skip for now
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [fragment, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) {
                parts.push(
                    new RenderFragment(
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' ${attrCanonical}="${escaped}"'`));
            }
        } else if (attrCanonical === 'class') {
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) {
                const rawExpr = classExpr.rendered.replace(/^da\(\w+ => /, '').replace(/\)$/, '');
                parts.push(
                    new RenderFragment(
                        `' class="' + escapeAttr(String(${rawExpr})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' class="${escaped}"'`));
            }
        } else if (attrCanonical === 'style') {
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    new RenderFragment(
                        `' style="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' style="${escaped}"'`));
            }
        } else {
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    new RenderFragment(
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' ${attrCanonical}="${escaped}"'`));
            }
        }
    });

    const filtered = parts.filter((f) => f.rendered.trim().length > 0);
    if (filtered.length === 0) return RenderFragment.empty();
    return filtered.reduce(
        (prev, curr) =>
            new RenderFragment(
                prev.rendered + ' + ' + curr.rendered,
                prev.imports.plus(curr.imports),
                [...prev.validations, ...curr.validations],
            ),
    );
}

/**
 * Collect async directive groups from child nodes.
 * Groups when-loading, when-resolved, when-rejected by property name.
 */
interface AsyncGroup {
    propertyName: string;
    loadingElement: HTMLElement | null;
    resolvedElement: HTMLElement | null;
    rejectedElement: HTMLElement | null;
}

function collectAsyncGroups(childNodes: Node[]): Map<string, AsyncGroup> {
    const groups = new Map<string, AsyncGroup>();
    for (const child of childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const el = child as HTMLElement;
        const asyncDir = checkAsync(el);
        if (!asyncDir.isAsync) continue;
        const propName = el.getAttribute(asyncDir.directive);
        if (!groups.has(propName)) {
            groups.set(propName, {
                propertyName: propName,
                loadingElement: null,
                resolvedElement: null,
                rejectedElement: null,
            });
        }
        const group = groups.get(propName);
        if (asyncDir === AsyncDirectiveTypes.loading) group.loadingElement = el;
        else if (asyncDir === AsyncDirectiveTypes.resolved) group.resolvedElement = el;
        else if (asyncDir === AsyncDirectiveTypes.rejected) group.rejectedElement = el;
    }
    return groups;
}

function renderServerElementContent(
    element: HTMLElement,
    context: ServerContext,
    options?: { isRoot?: boolean },
): RenderFragment {
    const { variables, indent } = context;

    // Check if this element has a single dynamic text child
    const childNodes = filterContentNodes(element.childNodes, true);

    let dynamicTextFragment: RenderFragment | null = null;
    const dataJayDynamic = element.getAttribute('data-jay-dynamic');
    if (dataJayDynamic) {
        const [fragment, isDynamic] = parseServerTemplateExpression(
            textEscape(dataJayDynamic),
            variables,
        );
        if (isDynamic) {
            dynamicTextFragment = fragment;
        }
        // Skip coordinate if bindings are all non-interactive (slow/fast-only)
        if (
            dynamicTextFragment &&
            context.interactivePaths.size > 0 &&
            !textHasInteractiveBindings(dataJayDynamic, context.interactivePaths)
        ) {
            dynamicTextFragment = null;
        }
    } else if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const [fragment, isDynamic] = parseServerTemplateExpression(textEscape(text), variables);
        if (isDynamic) {
            dynamicTextFragment = fragment;
        }
        // Skip coordinate if bindings are all non-interactive (slow/fast-only)
        if (
            dynamicTextFragment &&
            context.interactivePaths.size > 0 &&
            !textHasInteractiveBindings(text, context.interactivePaths)
        ) {
            dynamicTextFragment = null;
        }
    }

    // Determine if this element needs a jay-coordinate attribute.
    // Only emit for elements that the hydrate target needs to adopt.
    // Root must always emit: hydrate needs adoptElement("0", ...) to resolve.
    // Interactive conditional elements (if=) must emit: hydrate adoptElement fails otherwise,
    // causing createFallback to create duplicates (SSR content + client-created).
    // Non-interactive conditionals (slow/fast-only) are static on client and don't need coordinates.
    const refName = element.attributes.ref ? camelCase(element.attributes.ref) : null;
    const needsCoordinate =
        options?.isRoot === true ||
        (isConditional(element) &&
            conditionIsInteractive(element.getAttribute('if'), context.interactivePaths)) ||
        dynamicTextFragment !== null ||
        refName !== null ||
        hasDynamicAttributeBindings(element, variables) ||
        hasInteractiveChildElements(childNodes) ||
        hasMixedContentDynamicTextInteractive(childNodes, context.interactivePaths);

    // Read pre-assigned coordinate value from jay-coordinate-base (DL#103)
    const coordTemplate = needsCoordinate ? element.getAttribute(COORD_ATTR) : null;

    const isVoid = voidElements.has(element.rawTagName.toLowerCase());
    const closeTag = isVoid ? ' />' : '>';
    const parts: RenderFragment[] = [];

    // Opening tag
    parts.push(w(indent, `'<${element.rawTagName}'`));
    const attrs = renderServerAttributes(element, context);
    if (attrs.rendered.trim()) {
        parts.push(attrs);
    }
    if (coordTemplate !== null) {
        if (isStaticCoordinate(coordTemplate)) {
            // Static coordinate (no $placeholder). If inside forEach with an accumulated
            // prefix, this is a nested forEach child with positional coords — prepend
            // the full accumulated prefix (all ancestor + current forEach trackBy values).
            if (context.forEachAccumulatedPrefix) {
                parts.push(
                    w(
                        indent,
                        `' jay-coordinate="' + ${context.forEachAccumulatedPrefix} + '/${coordTemplate}"${closeTag}'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                parts.push(w(indent, `' jay-coordinate="${coordTemplate}"${closeTag}'`));
            }
        } else {
            const coordExpr = compileCoordinateExpr(coordTemplate, context.varMappings);
            // Dynamic coordinate with $placeholder. If there's an ancestor prefix
            // (from slow forEach or outer fast forEach), prepend it — the $trackBy
            // in the template already resolves to the current forEach's item value.
            if (context.forEachAncestorPrefix) {
                parts.push(
                    w(
                        indent,
                        `' jay-coordinate="' + ${context.forEachAncestorPrefix} + '/' + ${coordExpr} + '"${closeTag}'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                parts.push(
                    w(
                        indent,
                        `' jay-coordinate="' + ${coordExpr} + '"${closeTag}'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            }
        }
    } else {
        parts.push(w(indent, `'${closeTag}'`));
    }

    if (isVoid) return mergeServerFragments(parts);

    // Children
    if (dynamicTextFragment) {
        parts.push(
            w(
                indent,
                `escapeHtml(String(${dynamicTextFragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            ),
        );
    } else {
        const childContext: ServerContext = {
            ...context,
            indent: new Indent(indent.curr + '    '),
        };
        // Collect async groups for this element's children
        const asyncGroups = collectAsyncGroups(childNodes);
        const processedAsyncProps = new Set<string>();

        for (const child of childNodes) {
            // Skip async resolved/rejected — they're handled when we encounter their loading sibling
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                const asyncDir = checkAsync(child as HTMLElement);
                if (
                    asyncDir === AsyncDirectiveTypes.resolved ||
                    asyncDir === AsyncDirectiveTypes.rejected
                ) {
                    continue;
                }
                if (asyncDir === AsyncDirectiveTypes.loading) {
                    const propName = (child as HTMLElement).getAttribute(asyncDir.directive);
                    if (processedAsyncProps.has(propName)) continue;
                    processedAsyncProps.add(propName);

                    const group = asyncGroups.get(propName);
                    const asyncFragment = renderServerAsyncGroup(group, childContext);
                    if (asyncFragment.rendered.trim()) {
                        parts.push(asyncFragment);
                    }
                    continue;
                }
            }

            const childFragment = renderServerNode(child, childContext);
            if (childFragment.rendered.trim()) {
                parts.push(childFragment);
            }
        }
    }

    // Closing tag
    parts.push(w(indent, `'</${element.rawTagName}>'`));

    return mergeServerFragments(parts);
}

/**
 * Render an async group: when-loading inline + onAsync() call with resolved/rejected templates.
 */
function renderServerAsyncGroup(group: AsyncGroup, context: ServerContext): RenderFragment {
    const { variables, indent } = context;
    const propName = group.propertyName;
    const parts: RenderFragment[] = [];

    // Parse the async accessor from the parent's variables
    const asyncResult = validateAsyncAccessor(propName, 'when-loading', variables);
    if (isValidationError(asyncResult)) return asyncResult;
    const asyncAccessor = asyncResult;

    // 1. Render when-loading inline with jay-async wrapper
    if (group.loadingElement) {
        parts.push(w(indent, `'<div jay-async="${propName}:pending">'`));

        // Render the loading element's content (using parent variables — not resolved type)
        const loadingContent = renderServerElementContent(group.loadingElement, context);
        if (loadingContent.rendered.trim()) {
            parts.push(loadingContent);
        }

        parts.push(w(indent, `'</div>'`));
    }

    // 2. Build onAsync() call with resolved/rejected template functions
    const templateParts: string[] = [];
    let templateImports = Imports.none();
    const templateValidations: string[] = [];

    if (group.resolvedElement) {
        const promiseResolvedType = (asyncAccessor.resolvedType as JayPromiseType).itemType;
        const resolvedVariables = new Variables(promiseResolvedType, variables, 1);
        const resolvedContext: ServerContext = {
            ...context,
            variables: resolvedVariables,
        };
        const resolvedString = renderServerElementAsString(
            group.resolvedElement,
            resolvedContext,
            propName,
        );
        templateParts.push(
            `resolved: (${resolvedVariables.currentVar}) => ${resolvedString.rendered}`,
        );
        templateImports = templateImports.plus(resolvedString.imports);
        templateValidations.push(...resolvedString.validations);
    }

    if (group.rejectedElement) {
        const rejectedVariables = new Variables(JayErrorType, variables, 1);
        const rejectedContext: ServerContext = {
            ...context,
            variables: rejectedVariables,
        };
        const rejectedString = renderServerElementAsString(
            group.rejectedElement,
            rejectedContext,
            propName,
        );
        templateParts.push(
            `rejected: (${rejectedVariables.currentVar}) => ${rejectedString.rendered}`,
        );
        templateImports = templateImports.plus(rejectedString.imports);
        templateValidations.push(...rejectedString.validations);
    }

    // Emit onAsync call
    const asyncExpr = asyncAccessor.render().rendered;
    const onAsyncCall = `${indent.firstLine}onAsync(${asyncExpr}, '${propName}', {${templateParts.join(', ')}});`;
    parts.push(new RenderFragment(onAsyncCall, templateImports, templateValidations));

    return mergeServerFragments(parts);
}

export function hasDynamicAttributeBindings(element: HTMLElement, variables: Variables): boolean {
    const attributes = element.attributes;
    for (const attrName of Object.keys(attributes)) {
        const attrCanonical = attrName.toLowerCase();
        if (isDirectiveAttribute(attrCanonical)) continue;
        const attrValue = attributes[attrName];
        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue !== '') return true; // Dynamic boolean is always dynamic
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) return true;
        } else if (attrCanonical === 'class') {
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) return true;
        } else {
            const [, isDynamic] = parseServerTemplateExpression(textEscape(attrValue), variables);
            if (isDynamic) return true;
        }
    }
    return false;
}

export function hasInteractiveChildElements(childNodes: Node[]): boolean {
    return childNodes.some(
        (child) =>
            child.nodeType === NodeType.ELEMENT_NODE &&
            (isConditional(child as HTMLElement) ||
                isForEach(child as HTMLElement) ||
                checkAsync(child as HTMLElement).isAsync),
    );
}

/** Mixed content: text with binding + element siblings (DL#102). Parent needs jay-coordinate for adoptText. */
export function hasMixedContentDynamicText(childNodes: Node[]): boolean {
    const hasTextWithBinding = (n: Node) =>
        n.nodeType === NodeType.TEXT_NODE &&
        /\{[^}]+\}/.test((n as Node & { innerText?: string }).innerText || '');
    return (
        childNodes.some(hasTextWithBinding) &&
        childNodes.some((n) => n.nodeType === NodeType.ELEMENT_NODE)
    );
}

/** Phase-aware variant: only counts bindings that are interactive. */
export function hasMixedContentDynamicTextInteractive(
    childNodes: Node[],
    interactivePaths: Set<string>,
): boolean {
    const hasTextWithInteractiveBinding = (n: Node) =>
        n.nodeType === NodeType.TEXT_NODE &&
        /\{[^}]+\}/.test((n as Node & { innerText?: string }).innerText || '') &&
        (interactivePaths.size === 0 ||
            textHasInteractiveBindings(
                (n as Node & { innerText?: string }).innerText || '',
                interactivePaths,
            ));
    return (
        childNodes.some(hasTextWithInteractiveBinding) &&
        childNodes.some((n) => n.nodeType === NodeType.ELEMENT_NODE)
    );
}

export interface ServerElementOptions {
    /** Path to write debug coordinate pre-process output. When provided, the
     *  serialized DOM with jay-coordinate-base attributes is returned via result. */
    debugCoordinatePreprocessPath?: string;
}

export function generateServerElementFile(
    jayFile: JayHtmlSourceFile,
    _options?: ServerElementOptions,
): WithValidations<string> {
    const types = generateTypes(jayFile.types);
    const variables = new Variables(jayFile.types);
    const rootElement = ensureSingleChildElement(jayFile.body);

    if (!rootElement.val) {
        return new WithValidations('', rootElement.validations);
    }

    const headlessImports = jayFile.headlessImports?.filter((h) => !h.key) ?? [];
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));

    // Pre-process: assign coordinates to all elements (DL#103)
    assignCoordinates(jayFile.body, { headlessContractNames });

    const context: ServerContext = {
        variables,
        indent: new Indent('    '),
        headlessContractNames,
        headlessImports,
        headlessInstanceCounter: { count: 0 },
        varMappings: {},
        insideForEach: false,
        insideSlowForEach: false,
        interactivePaths: buildInteractivePaths(jayFile.contract),
    };

    // Render root element — coordinate comes from jay-coordinate-base.
    // Root must emit jay-coordinate="0" so hydrate can resolve adoptElement("0", ...).
    const rendered = renderServerElementContent(rootElement.val as HTMLElement, context, {
        isRoot: true,
    });

    const viewStateType = jayFile.types.name;

    // Detect if async is used (onAsync call was emitted)
    const hasAsync = rendered.rendered.includes('onAsync(');

    // Build import statement for ssr-runtime
    const importParts: string[] = [];
    if (rendered.imports.has(Import.escapeHtml)) importParts.push('escapeHtml');
    if (rendered.imports.has(Import.escapeAttr)) importParts.push('escapeAttr');
    importParts.push('type ServerRenderContext');

    const importStatement = `import {${importParts.join(', ')}} from "@jay-framework/ssr-runtime";`;

    // Collect type names used from headless imports (ViewState types, enum types,
    // forEach iteration types) so we can generate import statements for them.
    // Refs types are excluded since SSR doesn't handle refs.
    const usedTypeNames = new Set<string>();
    const headlessModules = new Set<string>();
    for (const headless of jayFile.headlessImports) {
        usedTypeNames.add(headless.rootType.name);
        for (const link of headless.contractLinks) {
            headlessModules.add(link.module);
            for (const name of link.names) {
                if (!name.name.endsWith('Refs')) {
                    usedTypeNames.add(name.name);
                }
            }
        }
    }

    // Generate import statements for headless types (ViewState, enums, iteration types).
    const contractImports = jayFile.imports
        .filter((imp) => headlessModules.has(imp.module))
        .map((imp) => {
            const typeNames = imp.names
                .filter((n) => usedTypeNames.has(n.as || n.name))
                .map((n) => (n.as ? `${n.name} as ${n.as}` : n.name));
            if (typeNames.length === 0) return null;
            return `import {${typeNames.join(', ')}} from "${imp.module}";`;
        })
        .filter((_): _ is string => _ !== null);

    // Destructure onAsync from ctx when async directives are present
    const ctxDestructure = hasAsync
        ? 'const { write: w, onAsync } = ctx;'
        : 'const { write: w } = ctx;';

    const renderedFile = [
        importStatement,
        ...contractImports,
        types,
        `export function renderToStream(vs: ${viewStateType}, ctx: ServerRenderContext): void {
    ${ctxDestructure}
${rendered.rendered}
}`,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');

    return new WithValidations(renderedFile, rendered.validations);
}
