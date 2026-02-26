import {
    Contract,
    ContractTag,
    camelCase,
    type HeadlessContractInfo,
} from '@jay-framework/compiler-jay-html';
import { isAtomicType, isEnumType, type JayType } from '@jay-framework/compiler-shared';

const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export type CoerceResult = { value: unknown; ok: true } | { ok: false; reason: string };

/**
 * Extract ViewState override parameters from query string.
 * Filters params starting with "vs.", strips the prefix, and returns a flat Record.
 * Returns undefined if no vs.* params are present.
 * 
 * Accepts any query object (Record or ParsedQs from Express).
 */
export function extractViewStateParams(
    query: Record<string, any> | undefined,
): Record<string, string> | undefined {
    if (!query) return undefined;

    const vsParams: Record<string, string> = {};
    let hasAny = false;

    for (const [key, value] of Object.entries(query)) {
        if (key.startsWith('vs.')) {
            const strippedKey = key.slice(3);
            // Last wins: if value is array, take last element
            // For ParsedQs compatibility, we only handle string and string[]
            if (typeof value === 'string') {
                vsParams[strippedKey] = value;
                hasAny = true;
            } else if (Array.isArray(value)) {
                const lastValue = value[value.length - 1];
                if (typeof lastValue === 'string') {
                    vsParams[strippedKey] = lastValue;
                    hasAny = true;
                }
            }
        }
    }

    return hasAny ? vsParams : undefined;
}

/**
 * Check if a path segment array is safe to use for object property access.
 * Blocks prototype pollution vectors: __proto__, constructor, prototype.
 */
export function isPathSafe(segments: string[]): boolean {
    for (const segment of segments) {
        if (BLOCKED_SEGMENTS.has(segment)) {
            return false;
        }
    }
    return true;
}

/**
 * Set a value at a nested path in an object.
 * Auto-creates intermediate objects and arrays as needed.
 * Numeric segments create arrays; non-numeric create objects.
 * Array holes are filled with empty objects {}.
 */
export function setNestedValue(obj: any, path: string[], value: unknown): void {
    let current = obj;

    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        const nextSegment = path[i + 1];
        const isNextNumeric = /^\d+$/.test(nextSegment);

        if (!(segment in current) || typeof current[segment] !== 'object' || current[segment] === null) {
            // Need to create intermediate value
            const isCurrentNumeric = /^\d+$/.test(segment);
            if (isCurrentNumeric) {
                // We're setting an array index
                if (!Array.isArray(current)) {
                    current = [];
                }
                const idx = parseInt(segment, 10);
                // Fill holes with empty objects
                while (current.length <= idx) {
                    current.push({});
                }
                // Create next level
                current[idx] = isNextNumeric ? [] : {};
                current = current[idx];
            } else {
                // Regular property
                current[segment] = isNextNumeric ? [] : {};
                current = current[segment];
            }
        } else {
            current = current[segment];
        }
    }

    // Set the final value
    const lastSegment = path[path.length - 1];
    const isNumeric = /^\d+$/.test(lastSegment);
    if (isNumeric && Array.isArray(current)) {
        const idx = parseInt(lastSegment, 10);
        // Fill holes
        while (current.length <= idx) {
            current.push({});
        }
        current[idx] = value;
    } else {
        current[lastSegment] = value;
    }
}

/**
 * Coerce a raw string value to the correct type based on contract tag information.
 * Returns a discriminated union: { value, ok: true } | { ok: false, reason }.
 */
export function coerceValue(rawValue: string, tag?: ContractTag): CoerceResult {
    // JSON values (arrays or objects) — parse regardless of contract type
    if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
        try {
            return { value: JSON.parse(rawValue), ok: true };
        } catch {
            return { ok: false, reason: `invalid JSON: ${rawValue}` };
        }
    }

    const dataType = tag?.dataType;
    if (!dataType) return { value: rawValue, ok: true }; // no type info → string

    // Enum type: match by name → index, or accept valid integer index
    if (isEnumType(dataType)) {
        const idx = dataType.values.indexOf(rawValue);
        if (idx !== -1) return { value: idx, ok: true };
        const num = Number(rawValue);
        if (Number.isInteger(num) && num >= 0 && num < dataType.values.length) {
            return { value: num, ok: true };
        }
        return {
            ok: false,
            reason: `"${rawValue}" is not a valid enum value (${dataType.values.join(', ')})`,
        };
    }

    // Atomic types: all have kind = JayTypeKind.atomic, distinguished by name
    if (isAtomicType(dataType)) {
        switch (dataType.name) {
            case 'number': {
                const num = Number(rawValue);
                if (Number.isFinite(num)) return { value: num, ok: true };
                return { ok: false, reason: `"${rawValue}" is not a valid number` };
            }
            case 'boolean': {
                if (rawValue === 'true') return { value: true, ok: true };
                if (rawValue === 'false') return { value: false, ok: true };
                return {
                    ok: false,
                    reason: `"${rawValue}" is not a valid boolean (expected "true" or "false")`,
                };
            }
            case 'Date': {
                const date = new Date(rawValue);
                if (isNaN(date.getTime())) {
                    return { ok: false, reason: `"${rawValue}" is not a valid date` };
                }
                return { value: date.toISOString(), ok: true };
            }
            default:
                return { value: rawValue, ok: true }; // string, Unknown, etc.
        }
    }

    return { value: rawValue, ok: true };
}

/**
 * Find the contract tag at a given path.
 * Walks through contract tags, handling:
 * - Headless component keys (first segment may match a headless key)
 * - CamelCase comparison of path segments to tag names
 * - Numeric segments (array indices) skip into sub-contract tags
 */
export function findContractTag(
    path: string[],
    contract?: Contract,
    headlessContracts?: HeadlessContractInfo[],
): ContractTag | undefined {
    if (path.length === 0) return undefined;

    // Check if first segment matches a headless contract key
    const firstSegment = path[0];
    const headlessInfo = headlessContracts?.find((hc) => hc.key === firstSegment);

    let currentTags: ContractTag[] | undefined;
    let remainingPath: string[];

    if (headlessInfo) {
        // Start from headless contract
        currentTags = headlessInfo.contract.tags;
        remainingPath = path.slice(1);
    } else if (contract) {
        // Start from page contract
        currentTags = contract.tags;
        remainingPath = path;
    } else {
        return undefined;
    }

    // Walk the path
    for (let i = 0; i < remainingPath.length; i++) {
        const segment = remainingPath[i];
        const isNumeric = /^\d+$/.test(segment);

        if (isNumeric) {
            // Numeric segment: skip into sub-contract if current tag has one
            // We need to find the tag that contains this array
            // This is handled by continuing to the next segment - the array container
            // tag has been found, now we need to look into its sub-tags
            continue;
        }

        // Find matching tag by camelCase comparison
        const matchingTag = currentTags?.find((tag) => camelCase(tag.tag) === camelCase(segment));

        if (!matchingTag) return undefined;

        // If this is the last segment, return the tag
        if (i === remainingPath.length - 1) {
            return matchingTag;
        }

        // Otherwise, continue into nested tags
        currentTags = matchingTag.tags;
    }

    return undefined;
}

/**
 * Apply ViewState overrides from query params.
 * Processes overrides in sorted order: JSON replacements first, then dot-path overrides.
 * Returns a new ViewState object with overrides applied.
 */
export function applyViewStateOverrides(
    viewState: object,
    overrides: Record<string, string>,
    contract?: Contract,
    headlessContracts?: HeadlessContractInfo[],
): object {
    // Clone the ViewState to avoid mutation
    const result = JSON.parse(JSON.stringify(viewState));

    // Sort overrides: JSON replacements first (by path length), then dot-path
    const entries = Object.entries(overrides);
    const jsonEntries = entries.filter(([_, v]) => v.startsWith('[') || v.startsWith('{'));
    const dotPathEntries = entries.filter(([_, v]) => !v.startsWith('[') && !v.startsWith('{'));

    // Sort JSON entries by path length (shortest first)
    jsonEntries.sort((a, b) => a[0].length - b[0].length);

    const allEntries = [...jsonEntries, ...dotPathEntries];

    for (const [path, rawValue] of allEntries) {
        const segments = path.split('.');

        // Safety check
        if (!isPathSafe(segments)) {
            // Blocked path - skip silently (caller should log)
            continue;
        }

        // Find the contract tag for type information
        const tag = findContractTag(segments, contract, headlessContracts);

        // Coerce the value
        const coerceResult = coerceValue(rawValue, tag);

        if (!coerceResult.ok) {
            // Failed coercion - skip (caller should log)
            continue;
        }

        // Apply the override
        try {
            setNestedValue(result, segments, coerceResult.value);
        } catch {
            // setNestedValue failed - skip
            continue;
        }
    }

    return result;
}
