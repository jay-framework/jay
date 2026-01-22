import { HTMLElement, parse, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import { Contract, ContractTag, RenderingPhase } from '../contract';
import { WithValidations } from '@jay-framework/compiler-shared';

/**
 * Input for slow render transformation
 */
export interface SlowRenderInput {
    /** Original jay-html content */
    jayHtmlContent: string;
    /** Slow phase view state data */
    slowViewState: Record<string, unknown>;
    /** Contract metadata for phase detection */
    contract?: Contract;
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
}

/**
 * Build a map of property paths to their phase information from the contract
 */
function buildPhaseMap(contract: Contract | undefined): Map<string, PhaseInfo> {
    const phaseMap = new Map<string, PhaseInfo>();

    if (!contract) {
        return phaseMap;
    }

    function processTag(tag: ContractTag, path: string, parentPhase: RenderingPhase = 'slow') {
        const effectivePhase = tag.phase || parentPhase;
        const propertyName = toCamelCase(tag.tag);
        const currentPath = path ? `${path}.${propertyName}` : propertyName;

        phaseMap.set(currentPath, {
            phase: effectivePhase,
            isArray: tag.repeated || false,
            trackBy: tag.trackBy,
        });

        // Process nested tags
        if (tag.tags) {
            for (const childTag of tag.tags) {
                processTag(childTag, currentPath, effectivePhase);
            }
        }
    }

    for (const tag of contract.tags) {
        processTag(tag, '', 'slow');
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
 */
function isSlowPhase(path: string, phaseMap: Map<string, PhaseInfo>): boolean {
    const info = phaseMap.get(path);
    // Default to slow phase if not specified
    return !info || info.phase === 'slow';
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
 */
function resolveTextBindings(
    text: string,
    contextData: Record<string, unknown>,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string = '',
): string {
    return text.replace(/{([^}]+)}/g, (match, expr) => {
        const trimmedExpr = expr.trim();

        // Check if it's a simple property path
        if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmedExpr)) {
            const fullPath = contextPath ? `${contextPath}.${trimmedExpr}` : trimmedExpr;

            if (isSlowPhase(fullPath, phaseMap)) {
                // Get value from the current context data (not root)
                const value = getValueByPath(contextData, trimmedExpr);
                if (value !== undefined && value !== null) {
                    return String(value);
                }
            }
        }

        // Keep the binding as-is for non-slow or complex expressions
        return match;
    });
}

/**
 * Transform a single element, resolving slow bindings
 */
function transformElement(
    element: HTMLElement,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string = '',
    contextData: Record<string, unknown>,
): HTMLElement[] {
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
                const results: HTMLElement[] = [];

                arrayValue.forEach((item, index) => {
                    // Clone the element
                    const cloned = element.clone() as HTMLElement;

                    // Remove forEach, add slowForEach
                    cloned.removeAttribute('forEach');
                    cloned.setAttribute('slowForEach', forEachAttr);
                    cloned.setAttribute('jayIndex', String(index));

                    // Get trackBy value
                    const trackByValue =
                        item && typeof item === 'object' ? String((item as any)[trackBy] || index) : String(index);
                    cloned.setAttribute('jayTrackBy', trackByValue);

                    // Transform children with new context - item becomes the new contextData
                    const newContextPath = fullPath;
                    const itemData = item as Record<string, unknown>;
                    const transformedChildren = transformChildren(
                        cloned,
                        phaseMap,
                        newContextPath,
                        itemData,
                    );

                    // Replace children
                    cloned.innerHTML = '';
                    for (const child of transformedChildren) {
                        cloned.appendChild(child as any);
                    }

                    results.push(cloned);
                });

                return results;
            }
        }
    }

    // Handle if directive (slow conditional)
    const ifAttr = element.getAttribute('if');
    if (ifAttr) {
        const binding = parseBinding(`{${ifAttr}}`);
        if (binding) {
            const fullPath = contextPath ? `${contextPath}.${binding}` : binding;

            if (isSlowPhase(fullPath, phaseMap)) {
                const value = getValueByPath(contextData, binding);

                // If false, remove the element
                if (!value) {
                    return [];
                }

                // If true, remove the if attribute and keep the element
                element.removeAttribute('if');
            }
        }
    }

    // Transform text content in child nodes (direct text, not nested elements)
    // Note: we don't process text here because transformChildren handles it
    
    // Transform attributes
    for (const attrName of Object.keys(element.attributes)) {
        if (['foreach', 'trackby', 'slowforeach', 'jayindex', 'jaytrackby', 'if', 'ref'].includes(attrName.toLowerCase())) {
            continue;
        }

        const attrValue = element.getAttribute(attrName);
        if (attrValue && hasBindings(attrValue)) {
            const resolved = resolveTextBindings(attrValue, contextData, phaseMap, contextPath);
            element.setAttribute(attrName, resolved);
        }
    }

    // Recursively transform children
    const transformedChildren = transformChildren(element, phaseMap, contextPath, contextData);
    element.innerHTML = '';
    for (const child of transformedChildren) {
        element.appendChild(child as any);
    }

    return [element];
}

/**
 * Transform all children of an element
 */
function transformChildren(
    parent: HTMLElement,
    phaseMap: Map<string, PhaseInfo>,
    contextPath: string = '',
    contextData: Record<string, unknown>,
): Node[] {
    const results: Node[] = [];

    for (const child of parent.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            const transformed = transformElement(
                child as HTMLElement,
                phaseMap,
                contextPath,
                contextData,
            );
            results.push(...transformed);
        } else if (child.nodeType === NodeType.TEXT_NODE) {
            const text = child.rawText;
            if (hasBindings(text)) {
                const resolved = resolveTextBindings(text, contextData, phaseMap, contextPath);
                (child as Node & { _rawText: string })._rawText = resolved;
            }
            results.push(child as Node);
        } else {
            results.push(child as Node);
        }
    }

    return results;
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

        // Build phase map from contract
        const phaseMap = buildPhaseMap(input.contract);

        // Get the body element
        const body = root.querySelector('body');
        if (!body) {
            validations.push('jay-html must have a body element');
            return new WithValidations(undefined, validations);
        }

        // Transform body children
        const transformedChildren = transformChildren(body, phaseMap, '', input.slowViewState);
        body.innerHTML = '';
        for (const child of transformedChildren) {
            body.appendChild(child as any);
        }

        // Generate output
        const output: SlowRenderOutput = {
            preRenderedJayHtml: root.toString(),
        };

        return new WithValidations(output, validations);
    } catch (error) {
        validations.push(`Slow render transform failed: ${error.message}`);
        return new WithValidations(undefined, validations);
    }
}

/**
 * Check if a jay-html file has any slow-phase properties that can be pre-rendered
 */
export function hasSlowPhaseProperties(contract: Contract | undefined): boolean {
    if (!contract) {
        return false;
    }

    function checkTag(tag: ContractTag, parentPhase: RenderingPhase = 'slow'): boolean {
        const effectivePhase = tag.phase || parentPhase;

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
