import { Contract, ContractTag, ContractTagType } from '@jay-framework/compiler-jay-html';

/**
 * Deep merge two view states (slow and fast) based on the contract structure.
 * Uses trackBy for array merging to maintain item identity across phases.
 *
 * @param slow - ViewState from slow rendering phase
 * @param fast - ViewState from fast rendering phase
 * @param contract - Contract defining the structure and trackBy metadata
 * @returns Merged ViewState combining properties from both phases
 */
export function deepMergeViewStates(
    slow: object | undefined,
    fast: object | undefined,
    contract: Contract,
): object {
    if (!slow && !fast) return {};
    if (!slow) return fast || {};
    if (!fast) return slow || {};

    return deepMergeObjects(slow, fast, contract.tags);
}

/**
 * Deep merge two objects based on contract tags
 */
function deepMergeObjects(slow: object, fast: object, contractTags: ContractTag[]): object {
    const result: any = {};

    // Create a map of contract tags by name for quick lookup
    const tagsByName = new Map(contractTags.map((tag) => [tag.tag, tag]));

    // Merge all keys from both objects
    const allKeys = new Set([...Object.keys(slow), ...Object.keys(fast)]);

    for (const key of allKeys) {
        const slowValue = (slow as any)[key];
        const fastValue = (fast as any)[key];
        const contractTag = tagsByName.get(key);

        if (fastValue === undefined) {
            // Only in slow
            result[key] = slowValue;
        } else if (slowValue === undefined) {
            // Only in fast
            result[key] = fastValue;
        } else if (contractTag && isRepeatedSubContract(contractTag)) {
            // Array: merge by trackBy
            result[key] = mergeArraysByTrackBy(slowValue, fastValue, contractTag);
        } else if (contractTag && isSubContract(contractTag) && contractTag.tags) {
            // Nested object: recurse
            result[key] = deepMergeObjects(slowValue, fastValue, contractTag.tags);
        } else if (
            typeof slowValue === 'object' &&
            slowValue !== null &&
            typeof fastValue === 'object' &&
            fastValue !== null &&
            !Array.isArray(slowValue) &&
            !Array.isArray(fastValue)
        ) {
            // Nested object without contract tags (fallback): shallow merge
            result[key] = { ...slowValue, ...fastValue };
        } else {
            // Primitive or conflicting types: fast wins
            result[key] = fastValue;
        }
    }

    return result;
}

/**
 * Merge two arrays using trackBy to match items by identity
 */
function mergeArraysByTrackBy(slowArray: any[], fastArray: any[], contractTag: ContractTag): any[] {
    if (!Array.isArray(slowArray) || !Array.isArray(fastArray)) {
        // Type mismatch - return fast value
        return fastArray;
    }

    const trackBy = contractTag.trackBy;
    if (!trackBy) {
        // No trackBy specified - fallback to fast array
        console.warn(
            `Repeated sub-contract [${contractTag.tag}] is missing trackBy attribute. ` +
                `Using fast array. This may cause data loss. Add trackBy to the contract.`,
        );
        return fastArray;
    }

    const itemContract = contractTag.tags || [];

    // Build index of slow items by trackBy key
    const slowByKey = new Map<string | number, any>();
    for (const item of slowArray) {
        const key = item[trackBy];
        if (key !== undefined && key !== null) {
            if (slowByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in slow array [${contractTag.tag}]. ` +
                        `This may cause incorrect merging.`,
                );
            }
            slowByKey.set(key, item);
        }
    }

    // Build index of fast items by trackBy key
    const fastByKey = new Map<string | number, any>();
    for (const item of fastArray) {
        const key = item[trackBy];
        if (key !== undefined && key !== null) {
            if (fastByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in fast array [${contractTag.tag}]. ` +
                        `This may cause incorrect merging.`,
                );
            }
            fastByKey.set(key, item);
        }
    }

    // Merge: Start with slow array order, merge matching fast items
    const result: any[] = [];
    const processedKeys = new Set<string | number>();

    for (const slowItem of slowArray) {
        const key = slowItem[trackBy];
        if (key === undefined || key === null) {
            // Item missing trackBy key - include slow item as-is
            result.push(slowItem);
            continue;
        }

        processedKeys.add(key);
        const fastItem = fastByKey.get(key);

        if (fastItem) {
            // Item exists in both: deep merge
            const mergedItem = deepMergeObjects(slowItem, fastItem, itemContract);
            result.push(mergedItem);
        } else {
            // Item only in slow
            result.push(slowItem);
        }
    }

    // Add items that only exist in fast
    for (const fastItem of fastArray) {
        const key = fastItem[trackBy];
        if (key === undefined || key === null) {
            // Item missing trackBy key - include fast item as-is
            result.push(fastItem);
            continue;
        }

        if (!processedKeys.has(key)) {
            result.push(fastItem);
        }
    }

    return result;
}

/**
 * Check if a contract tag is a sub-contract
 */
function isSubContract(tag: ContractTag): boolean {
    return tag.type.includes(ContractTagType.subContract);
}

/**
 * Check if a contract tag is a repeated sub-contract (array)
 */
function isRepeatedSubContract(tag: ContractTag): boolean {
    return isSubContract(tag) && tag.repeated === true;
}
