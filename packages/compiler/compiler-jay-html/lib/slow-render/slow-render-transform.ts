import { HTMLElement, parse, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import path from 'path';
import {
    Contract,
    ContractTag,
    RenderingPhase,
    loadLinkedContract,
    getLinkedContractDir,
    getEffectivePhase,
} from '../contract';
import { isEnumType, WithValidations } from '@jay-framework/compiler-shared';
import { parseConditionForSlowRender, SlowRenderContext } from '../expressions/expression-compiler';
import { JayImportResolver } from '../jay-target/jay-import-resolver';
import { Coordinate } from '@jay-framework/runtime';

/**
 * Headless contract with its key (used for property path prefix)
 */
export interface HeadlessContractInfo {
    /** The key attribute from the headless script tag */
    key: string;
    /** The parsed contract */
    contract: Contract;
    /** Path to the contract file (used to resolve linked sub-contracts) */
    contractPath?: string;
    /** Optional metadata from the generator (for dynamic contracts) */
    metadata?: Record<string, unknown>;
}

/**
 * Input for slow render transformation
 */
export interface SlowRenderInput {
    /** Original jay-html content */
    jayHtmlContent: string;
    /** Slow phase view state data */
    slowViewState: Record<string, unknown>;
    /** Contract metadata for phase detection (page's main contract) */
    contract?: Contract;
    /**
     * Headless component contracts, keyed by their `key` attribute.
     * These contracts provide phase info for properties like `productSearch.categoryName`.
     */
    headlessContracts?: HeadlessContractInfo[];
    /**
     * Source directory of the original jay-html file.
     * Used to resolve relative paths (contracts, CSS, components) to absolute paths
     * so the pre-rendered file can be placed in a different directory.
     */
    sourceDir?: string;
    /**
     * Import resolver for loading linked sub-contracts.
     * If not provided, linked sub-contracts will not be resolved.
     */
    importResolver?: JayImportResolver;
}

/**
 * Output of slow render transformation
 */
export interface SlowRenderOutput {
    /** Pre-rendered jay-html content */
    preRenderedJayHtml: string;
}

/**
 * Phase information for a property path
 */
interface PhaseInfo {
    phase: RenderingPhase;
    isArray: boolean;
    trackBy?: string;
    /** For enum-typed properties, the list of enum value names (e.g., ["PHYSICAL", "DIGITAL"]) */
    enumValues?: string[];
}

/**
 * Build a map of property paths to their phase information from contracts.
 * Includes both the page's main contract and headless component contracts.
 * Recursively resolves linked sub-contracts.
 */
function buildPhaseMap(
    contract: Contract | undefined,
    headlessContracts?: HeadlessContractInfo[],
    importResolver?: JayImportResolver,
): Map<string, PhaseInfo> {
    const phaseMap = new Map<string, PhaseInfo>();

    function processTag(
        tag: ContractTag,
        pathPrefix: string,
        parentPhase: RenderingPhase = 'slow',
        contractDir?: string,
    ) {
        const effectivePhase = getEffectivePhase(tag, parentPhase);
        const propertyName = toCamelCase(tag.tag);
        const currentPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName;

        // Check if the tag has an enum dataType and extract enum values
        let enumValues: string[] | undefined;
        if (tag.dataType && isEnumType(tag.dataType)) {
            enumValues = tag.dataType.values;
        }

        phaseMap.set(currentPath, {
            phase: effectivePhase,
            isArray: tag.repeated || false,
            trackBy: tag.trackBy,
            enumValues,
        });

        // Process nested tags (inline sub-contract)
        if (tag.tags) {
            for (const childTag of tag.tags) {
                processTag(childTag, currentPath, effectivePhase, contractDir);
            }
        }

        // Process linked sub-contract (requires import resolver)
        if (tag.link && contractDir && importResolver) {
            const linkedContract = loadLinkedContract(tag.link, contractDir, importResolver);
            if (linkedContract) {
                const linkedContractDir = getLinkedContractDir(
                    tag.link,
                    contractDir,
                    importResolver,
                );

                for (const childTag of linkedContract.tags) {
                    processTag(childTag, currentPath, effectivePhase, linkedContractDir);
                }
            }
        }
    }

    // Process main contract
    if (contract) {
        for (const tag of contract.tags) {
            processTag(tag, '', 'slow');
        }
    }

    // Process headless contracts with their key as prefix
    if (headlessContracts) {
        for (const { key, contract: headlessContract, contractPath } of headlessContracts) {
            // Get the contract directory for resolving linked contracts
            const contractDir = contractPath ? path.dirname(contractPath) : undefined;

            for (const tag of headlessContract.tags) {
                // Use the headless key as the path prefix
                processTag(tag, key, 'slow', contractDir);
            }
        }
    }

    return phaseMap;
}

/**
 * Convert kebab-case or PascalCase to camelCase
 */
function toCamelCase(str: string): string {
    return str
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        .replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

/**
 * Check if a property path is in the slow phase
 *
 * IMPORTANT: Only return true if the property is EXPLICITLY marked as slow in the phase map.
 * If the property is not in the phase map (e.g., from a headless component), we don't know
 * its phase and should NOT evaluate it at slow-render time.
 */
function isSlowPhase(path: string, phaseMap: Map<string, PhaseInfo>): boolean {
    const info = phaseMap.get(path);
    // Only treat as slow if explicitly marked as slow in the phase map
    // Unknown properties (not in map) should NOT be evaluated
    return info !== undefined && info.phase === 'slow';
}

/**
 * Get value from nested object by path
 */
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Parse a binding expression like {productName} or {product.name}
 * Returns the property path or null if not a simple binding
 */
function parseBinding(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null;
    }

    const inner = trimmed.slice(1, -1).trim();

    // Check if it's a simple property path (no operators, function calls, etc.)
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(inner)) {
        return inner;
    }

    return null;
}

/**
 * Check if text contains any bindings
 */
function hasBindings(text: string): boolean {
    return /{[^}]+}/.test(text);
}

/**
 * Resolve bindings in a text string, replacing slow-phase bindings with values
 *
 * @param text - The text containing bindings
 * @param contextData - The data object for the current context (could be root or array item)
 * @param phaseMap - Map of property paths to phase info
 * @param contextPath - The property path prefix for phase lookup
 * @returns WithValidations containing resolved text and any validation errors
 */
function resolveTextBindings(
    text: string,
    contextData: Record<string, unknown>,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string = '',
): WithValidations<string> {
    const validationErrors: string[] = [];

    const resolved = text.replace(/{([^}]+)}/g, (match, expr) => {
        const trimmedExpr = expr.trim();

        // Check if it's a simple property path
        if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmedExpr)) {
            const fullPath = contextPath ? `${contextPath}.${trimmedExpr}` : trimmedExpr;

            if (isSlowPhase(fullPath, phaseMap)) {
                // Get value from the current context data (not root)
                const value = getValueByPath(contextData, trimmedExpr);

                // Check for truly missing values (undefined/null) vs valid falsy values (0, '', false)
                if (value === undefined || value === null) {
                    // Record validation error for missing slow-phase data
                    validationErrors.push(
                        `Slow-phase binding {${trimmedExpr}} at path "${fullPath}" has no value in slowViewState. ` +
                            `Expected a value but got ${value === undefined ? 'undefined' : 'null'}.`,
                    );
                    // Render as "undefined" to make the issue visible in output
                    return 'undefined';
                }

                // Valid value (including falsy values like 0, '', false)
                return String(value);
            }
        }

        // Keep the binding as-is for non-slow or complex expressions
        return match;
    });

    return new WithValidations(resolved, validationErrors);
}

/**
 * Transform a single element, resolving slow bindings
 * @returns WithValidations containing transformed elements and any validation errors
 */
function transformElement(
    element: HTMLElement,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string,
    contextData: Record<string, unknown>,
): WithValidations<HTMLElement[]> {
    // Handle forEach directive
    const forEachAttr = element.getAttribute('forEach');
    if (forEachAttr) {
        const fullPath = contextPath ? `${contextPath}.${forEachAttr}` : forEachAttr;
        const phaseInfo = phaseMap.get(fullPath);

        // If the array is slow phase, unroll it
        if (!phaseInfo || phaseInfo.phase === 'slow') {
            const arrayValue = getValueByPath(contextData, forEachAttr);

            if (Array.isArray(arrayValue)) {
                const trackBy = element.getAttribute('trackBy') || 'id';

                // Process each array item and collect results
                const itemResults = arrayValue.map((item, index): WithValidations<HTMLElement> => {
                    // Clone the element
                    const cloned = element.clone() as HTMLElement;

                    // Remove forEach and trackBy, add slowForEach with jay* attributes
                    cloned.removeAttribute('forEach');
                    cloned.removeAttribute('foreach');
                    cloned.removeAttribute('trackBy');
                    cloned.removeAttribute('trackby');
                    cloned.setAttribute('slowForEach', forEachAttr);
                    cloned.setAttribute('jayIndex', String(index));

                    // Get trackBy value
                    const trackByValue =
                        item && typeof item === 'object'
                            ? String((item as any)[trackBy] || index)
                            : String(index);
                    cloned.setAttribute('jayTrackBy', trackByValue);

                    // Transform children with new context
                    const itemData = item as Record<string, unknown>;
                    return transformChildren(cloned, phaseMap, fullPath, itemData).map(
                        (children) => {
                            cloned.innerHTML = '';
                            children.forEach((child) => cloned.appendChild(child as any));
                            return cloned;
                        },
                    );
                });

                return WithValidations.all(itemResults);
            }
        }
    }

    // Handle if directive (slow conditional)
    const ifAttr = element.getAttribute('if');
    if (ifAttr) {
        const slowContext: SlowRenderContext = {
            slowData: contextData,
            phaseMap: phaseMap as Map<string, { phase: string; isArray?: boolean }>,
            contextPath: contextPath,
        };

        const conditionResult = parseConditionForSlowRender(ifAttr, slowContext);

        if (conditionResult.type === 'resolved') {
            if (!conditionResult.value) {
                // Condition is false - remove the element
                return WithValidations.pure([]);
            }
            // Condition is true - remove the if attribute and keep the element
            element.removeAttribute('if');
        } else {
            // Mixed phase - update the if attribute with simplified expression
            if (conditionResult.simplifiedExpr && conditionResult.simplifiedExpr !== ifAttr) {
                element.setAttribute('if', conditionResult.simplifiedExpr);
            }
        }
    }

    // Transform attributes - collect all attribute resolution results
    const attrResults = Object.keys(element.attributes)
        .filter(
            (attrName) =>
                ![
                    'foreach',
                    'trackby',
                    'slowforeach',
                    'jayindex',
                    'jaytrackby',
                    'if',
                    'ref',
                ].includes(attrName.toLowerCase()),
        )
        .map((attrName) => {
            const attrValue = element.getAttribute(attrName);
            if (attrValue && hasBindings(attrValue)) {
                return resolveTextBindings(attrValue, contextData, phaseMap, contextPath).map(
                    (resolved) => {
                        element.setAttribute(attrName, resolved);
                        return null; // Side effect only
                    },
                );
            }
            return WithValidations.pure(null);
        });

    // Merge attribute validations and transform children
    return WithValidations.all(attrResults)
        .flatMap(() => transformChildren(element, phaseMap, contextPath, contextData))
        .map((children) => {
            element.innerHTML = '';
            children.forEach((child) => element.appendChild(child as any));
            return [element];
        });
}

/**
 * Transform all children of an element
 * @returns WithValidations containing transformed nodes and any validation errors
 */
function transformChildren(
    parent: HTMLElement,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string,
    contextData: Record<string, unknown>,
): WithValidations<Node[]> {
    // Process each child and collect WithValidations results
    const childResults = parent.childNodes.map((child): WithValidations<Node[]> => {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            return transformElement(child as HTMLElement, phaseMap, contextPath, contextData);
        } else if (child.nodeType === NodeType.TEXT_NODE) {
            const text = child.rawText;
            if (hasBindings(text)) {
                return resolveTextBindings(text, contextData, phaseMap, contextPath).map(
                    (resolved) => {
                        (child as Node & { _rawText: string })._rawText = resolved;
                        return [child as Node];
                    },
                );
            }
            return WithValidations.pure([child as Node]);
        } else {
            return WithValidations.pure([child as Node]);
        }
    });

    // Merge all results: flatten node arrays and collect all validations
    return WithValidations.all(childResults).map((arrays) => arrays.flat());
}

/**
 * Resolve relative paths in script, link, and component imports to absolute paths.
 * This is needed because the pre-rendered file may be placed in a different directory.
 */
function resolveRelativePaths(root: HTMLElement, sourceDir: string): void {
    // Resolve contract paths in jay-data scripts
    // e.g., <script type="application/jay-data" contract="./page.jay-contract">
    const jayDataScripts = root.querySelectorAll('script[type="application/jay-data"]');
    for (const script of jayDataScripts) {
        const contract = script.getAttribute('contract');
        if (contract && isRelativePath(contract)) {
            script.setAttribute('contract', path.resolve(sourceDir, contract));
        }
    }

    // Resolve headless component paths
    // e.g., <script type="application/jay-headless" src="./header.ts">
    const headlessScripts = root.querySelectorAll('script[type="application/jay-headless"]');
    for (const script of headlessScripts) {
        const src = script.getAttribute('src');
        if (src && isRelativePath(src)) {
            script.setAttribute('src', path.resolve(sourceDir, src));
        }
    }

    // Resolve CSS link paths
    // e.g., <link rel="stylesheet" href="./styles.css">
    const links = root.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
        const href = link.getAttribute('href');
        if (href && isRelativePath(href)) {
            link.setAttribute('href', path.resolve(sourceDir, href));
        }
    }

    // Resolve regular script src paths
    // e.g., <script src="./app.ts">
    const scripts = root.querySelectorAll('script[src]');
    for (const script of scripts) {
        const scriptType = script.getAttribute('type');
        // Skip jay-specific scripts (already handled above)
        if (scriptType === 'application/jay-data' || scriptType === 'application/jay-headless') {
            continue;
        }
        const src = script.getAttribute('src');
        if (src && isRelativePath(src)) {
            script.setAttribute('src', path.resolve(sourceDir, src));
        }
    }
}

/**
 * Check if a path is a relative path (starts with ./ or ../)
 */
function isRelativePath(p: string): boolean {
    return p.startsWith('./') || p.startsWith('../');
}

/**
 * Transform a jay-html file by resolving slow-phase bindings
 *
 * This is the main entry point for slow rendering.
 *
 * @param input - The input containing jay-html content, slow view state, and contract
 * @returns The pre-rendered jay-html with slow bindings resolved
 */
export function slowRenderTransform(input: SlowRenderInput): WithValidations<SlowRenderOutput> {
    const validations: string[] = [];

    try {
        // Parse the jay-html
        const root = parse(input.jayHtmlContent, {
            comment: true,
            blockTextElements: {
                script: true,
                style: true,
            },
        });

        // Build phase map from contract (includes headless contracts)
        const phaseMap = buildPhaseMap(
            input.contract,
            input.headlessContracts,
            input.importResolver,
        );

        // Remove phase map entries for headless keys that have no slow data.
        // This happens when a plugin only provides fast/interactive data (e.g., withInteractive()).
        // Without this, the slow render would resolve those properties to `undefined` and produce
        // invalid pre-rendered HTML like if="undefined === IMAGE".
        if (input.headlessContracts) {
            for (const { key } of input.headlessContracts) {
                if (!(key in input.slowViewState)) {
                    for (const path of [...phaseMap.keys()]) {
                        if (path === key || path.startsWith(`${key}.`)) {
                            phaseMap.delete(path);
                        }
                    }
                }
            }
        }

        // Get the body element
        const body = root.querySelector('body');
        if (!body) {
            validations.push('jay-html must have a body element');
            return new WithValidations(undefined, validations);
        }

        // Transform body children and generate output
        // Merge parsing validations with transform validations
        return transformChildren(body, phaseMap, '', input.slowViewState)
            .withValidationsFrom(new WithValidations(null, validations))
            .map((children) => {
                body.innerHTML = '';
                children.forEach((child) => body.appendChild(child as any));

                // Resolve relative paths if sourceDir is provided
                if (input.sourceDir) {
                    resolveRelativePaths(root, input.sourceDir);
                }

                return { preRenderedJayHtml: root.toString() };
            });
    } catch (error) {
        validations.push(`Slow render transform failed: ${error.message}`);
        return new WithValidations(undefined, validations);
    }
}

/**
 * Discovered headless component instance in pre-rendered jay-html.
 * Found after Pass 1 (page bindings resolved, slow forEach unrolled).
 */
export interface DiscoveredHeadlessInstance {
    /** Contract name from tag name (e.g., "product-card" from <jay:product-card>) */
    contractName: string;
    /** Props extracted from element attributes (camelCased keys, string values) */
    props: Record<string, string>;
    /**
     * Coordinate that uniquely identifies this instance in the page tree.
     * Built from ancestor slowForEach jayTrackBy values + "contractName:localIndex".
     */
    coordinate: Coordinate;
}

/**
 * Resolved data for a headless component instance.
 * Provided by the dev server after calling slowlyRender for each discovered instance.
 */
export interface HeadlessInstanceResolvedData {
    /** Coordinate matching the discovered instance */
    coordinate: Coordinate;
    /** The component's contract (for phase detection) */
    contract: Contract;
    /** Slow phase ViewState data for this instance */
    slowViewState: Record<string, unknown>;
}

/**
 * Discover headless component instances in pre-rendered jay-html.
 *
 * Call this after slowRenderTransform() (Pass 1) to find `<jay:xxx>` instances
 * that need their own slowlyRender call.
 *
 * Skips instances that:
 * - Are inside a preserved forEach (fast phase — props are still dynamic)
 * - Have unresolved bindings in their props (can't call slowlyRender without concrete values)
 */
/**
 * Build the coordinate prefix from ancestor slowForEach jayTrackBy values.
 * Walks up the DOM tree collecting trackBy IDs.
 */
export function buildCoordinatePrefix(element: HTMLElement): string[] {
    const parts: string[] = [];
    let current = element.parentNode as HTMLElement | null;

    while (current) {
        const jayTrackBy = current.getAttribute?.('jayTrackBy');
        if (jayTrackBy != null) {
            parts.unshift(jayTrackBy);
        }
        current = current.parentNode as HTMLElement | null;
    }

    return parts;
}

/**
 * Count how many same-contract siblings appear before this element.
 * Used to build the "contractName:localIndex" part of a coordinate.
 */
export function localIndexAmongSiblings(element: HTMLElement): number {
    const tag = element.tagName?.toLowerCase();
    const parent = element.parentNode;
    if (!parent) return 0;

    let index = 0;
    for (const sibling of parent.childNodes) {
        if (sibling === element) break;
        if (
            sibling.nodeType === NodeType.ELEMENT_NODE &&
            (sibling as HTMLElement).tagName?.toLowerCase() === tag
        ) {
            index++;
        }
    }
    return index;
}

/**
 * Build the full coordinate key string for a <jay:xxx> element.
 * Format: "jayTrackBy1/jayTrackBy2/.../contractName:ref"
 *
 * Uses the element's `ref` attribute if present. If the element has no ref,
 * a coordinateCounters map must be provided to auto-assign an index.
 */
export function buildInstanceCoordinateKey(
    element: HTMLElement,
    contractName: string,
    coordinateCounters?: Map<string, number>,
): string {
    const prefix = buildCoordinatePrefix(element);
    let ref = element.getAttribute?.('ref');
    if (!ref) {
        if (coordinateCounters) {
            const counterKey = [...prefix, contractName].join('/');
            const localIndex = coordinateCounters.get(counterKey) ?? 0;
            coordinateCounters.set(counterKey, localIndex + 1);
            ref = String(localIndex);
        } else {
            // Fallback for backward compat: use sibling counting
            ref = String(localIndexAmongSiblings(element));
        }
    }
    return [...prefix, `${contractName}:${ref}`].join('/');
}

export interface HeadlessInstanceDiscoveryResult {
    instances: DiscoveredHeadlessInstance[];
    /** HTML with auto-generated ref attributes embedded on <jay:xxx> elements */
    preRenderedJayHtml: string;
}

export function discoverHeadlessInstances(
    preRenderedJayHtml: string,
): HeadlessInstanceDiscoveryResult {
    const root = parse(preRenderedJayHtml, {
        comment: true,
        blockTextElements: {
            script: true,
            style: true,
        },
    });

    const instances: DiscoveredHeadlessInstance[] = [];
    const coordinateCounters = new Map<string, number>();

    function walk(element: HTMLElement, insidePreservedForEach: boolean) {
        const tagName = element.tagName?.toLowerCase();

        // Check if this element has a preserved forEach (fast phase — not unrolled by Pass 1)
        const hasForEach = element.getAttribute('forEach') != null;

        if (tagName?.startsWith('jay:')) {
            if (!insidePreservedForEach) {
                const contractName = tagName.substring(4);

                // Extract props from attributes (skip ref and jay-specific attributes)
                const props: Record<string, string> = {};
                for (const [key, value] of Object.entries(element.attributes)) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey !== 'ref' && !lowerKey.startsWith('jay')) {
                        props[toCamelCase(key)] = value;
                    }
                }

                // Skip instances with unresolved prop bindings (dynamic props)
                const hasUnresolvedProps = Object.values(props).some((v) => hasBindings(v));

                if (!hasUnresolvedProps) {
                    const prefix = buildCoordinatePrefix(element);

                    // Use explicit ref or auto-generate one
                    let ref = element.getAttribute('ref');
                    if (!ref) {
                        // Auto-generate ref using scope-level counter
                        const counterKey = [...prefix, contractName].join('/');
                        const localIndex = coordinateCounters.get(counterKey) ?? 0;
                        coordinateCounters.set(counterKey, localIndex + 1);
                        ref = String(localIndex);
                        // Embed the auto-ref in the HTML for downstream consumers
                        element.setAttribute('ref', ref);
                    }

                    const coordinate = [...prefix, `${contractName}:${ref}`];

                    instances.push({
                        contractName,
                        props,
                        coordinate,
                    });
                }
            }

            // Don't recurse into jay:xxx children for discovery
            // (children are the inline template, not nested instances)
            return;
        }

        // Recurse into children
        for (const child of element.childNodes) {
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                walk(child as HTMLElement, insidePreservedForEach || hasForEach);
            }
        }
    }

    const body = root.querySelector('body');
    if (body) {
        walk(body, false);
    }

    return { instances, preRenderedJayHtml: root.toString() };
}

/**
 * Resolve headless component instance bindings in pre-rendered jay-html.
 *
 * This is Pass 2 of the slow render pipeline:
 * - Pass 1: slowRenderTransform() — resolves page bindings, unrolls slow forEach
 * - Between passes: dev server calls slowlyRender for each discovered instance
 * - Pass 2: resolveHeadlessInstances() — resolves instance bindings using component ViewState
 *
 * @param preRenderedJayHtml - Output of Pass 1 (slowRenderTransform)
 * @param instanceData - Resolved data for each instance (in discovery order)
 * @param importResolver - Optional import resolver for linked sub-contracts
 */
/**
 * Serialize a coordinate to a string key for Map lookup.
 */
function coordinateKey(coord: Coordinate): string {
    return coord.join('/');
}

export function resolveHeadlessInstances(
    preRenderedJayHtml: string,
    instanceData: HeadlessInstanceResolvedData[],
    importResolver?: JayImportResolver,
): WithValidations<string> {
    const root = parse(preRenderedJayHtml, {
        comment: true,
        blockTextElements: {
            script: true,
            style: true,
        },
    });

    // Build a lookup map by coordinate for O(1) matching
    const dataByCoordinate = new Map<string, HeadlessInstanceResolvedData>();
    for (const data of instanceData) {
        dataByCoordinate.set(coordinateKey(data.coordinate), data);
    }

    const allValidations: string[] = [];

    function walkAndResolve(element: HTMLElement, insidePreservedForEach: boolean): void {
        const tagName = element.tagName?.toLowerCase();
        const hasForEach = element.getAttribute('forEach') != null;

        if (tagName?.startsWith('jay:') && !insidePreservedForEach) {
            // Check for unresolved prop bindings (same skip logic as discovery)
            const hasUnresolvedProps = Object.values(element.attributes).some(
                (v) => typeof v === 'string' && hasBindings(v),
            );

            if (!hasUnresolvedProps) {
                // Read coordinate from the ref attribute (embedded by discoverHeadlessInstances)
                const contractName = tagName.substring(4);
                const prefix = buildCoordinatePrefix(element);
                const ref = element.getAttribute('ref');
                if (!ref) {
                    allValidations.push(
                        `<jay:${contractName}> missing ref attribute — run discoverHeadlessInstances first`,
                    );
                    return;
                }
                const coord = [...prefix, `${contractName}:${ref}`];
                const data = dataByCoordinate.get(coordinateKey(coord));

                if (data) {
                    // Build phase map from the component's contract
                    const phaseMap = buildPhaseMap(data.contract, undefined, importResolver);

                    // Transform children with the component's slow ViewState
                    const result = transformChildren(element, phaseMap, '', data.slowViewState);
                    allValidations.push(...result.validations);
                    if (result.val) {
                        element.innerHTML = '';
                        result.val.forEach((child) => element.appendChild(child as any));
                    }
                }
            }

            // Don't recurse into jay:xxx children (already handled above or skipped)
            return;
        }

        // Recurse into children
        for (const child of element.childNodes) {
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                walkAndResolve(child as HTMLElement, insidePreservedForEach || hasForEach);
            }
        }
    }

    const body = root.querySelector('body');
    if (!body) {
        return new WithValidations(preRenderedJayHtml, ['jay-html must have a body element']);
    }

    walkAndResolve(body, false);
    return new WithValidations(root.toString(), allValidations);
}

/**
 * Check if a jay-html file has any slow-phase properties that can be pre-rendered
 */
export function hasSlowPhaseProperties(contract: Contract | undefined): boolean {
    if (!contract) {
        return false;
    }

    function checkTag(tag: ContractTag, parentPhase: RenderingPhase = 'slow'): boolean {
        const effectivePhase = getEffectivePhase(tag, parentPhase);

        if (effectivePhase === 'slow') {
            return true;
        }

        if (tag.tags) {
            for (const childTag of tag.tags) {
                if (checkTag(childTag, effectivePhase)) {
                    return true;
                }
            }
        }

        return false;
    }

    for (const tag of contract.tags) {
        if (checkTag(tag)) {
            return true;
        }
    }

    return false;
}
