/**
 * Deep merge two view states (slow and fast) using trackBy metadata for arrays.
 * Uses trackBy for array merging to maintain item identity across phases.
 *
 * @param slow - ViewState from slow rendering phase
 * @param fast - ViewState from fast rendering phase
 * @param trackByMap - Map from property path to trackBy field name (e.g., {"items": "id"})
 * @param path - Current property path (used for recursion)
 * @returns Merged ViewState combining properties from both phases
 */
export function deepMergeViewStates(
    slow: object | undefined,
    fast: object | undefined,
    trackByMap: Record<string, string>,
    path: string = '',
): object {
    if (!slow && !fast) return {};
    if (!slow) return fast || {};
    if (!fast) return slow || {};

    const result: any = {};
    const allKeys = new Set([...Object.keys(slow), ...Object.keys(fast)]);

    for (const key of allKeys) {
        const slowValue = (slow as any)[key];
        const fastValue = (fast as any)[key];
        const currentPath = path ? `${path}.${key}` : key;

        if (fastValue === undefined) {
            // Only in slow
            result[key] = slowValue;
        } else if (slowValue === undefined) {
            // Only in fast
            result[key] = fastValue;
        } else if (Array.isArray(slowValue) && Array.isArray(fastValue)) {
            // Array: check if we have trackBy info for this path
            const trackByField = trackByMap[currentPath];
            if (trackByField) {
                result[key] = mergeArraysByTrackBy(
                    slowValue,
                    fastValue,
                    trackByField,
                    trackByMap,
                    currentPath,
                );
            } else {
                // No trackBy info - use fast array
                result[key] = fastValue;
            }
        } else if (
            typeof slowValue === 'object' &&
            slowValue !== null &&
            typeof fastValue === 'object' &&
            fastValue !== null &&
            !Array.isArray(slowValue) &&
            !Array.isArray(fastValue)
        ) {
            // Nested object: recurse
            result[key] = deepMergeViewStates(slowValue, fastValue, trackByMap, currentPath);
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
function mergeArraysByTrackBy(
    slowArray: any[],
    fastArray: any[],
    trackByField: string,
    trackByMap: Record<string, string>,
    arrayPath: string,
): any[] {
    // Build index of slow items by trackBy key
    const slowByKey = new Map<string | number, any>();
    for (const item of slowArray) {
        const key = item[trackByField];
        if (key !== undefined && key !== null) {
            if (slowByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in slow array at path [${arrayPath}]. ` +
                        `This may cause incorrect merging.`,
                );
            }
            slowByKey.set(key, item);
        }
    }

    // Build index of fast items by trackBy key
    const fastByKey = new Map<string | number, any>();
    for (const item of fastArray) {
        const key = item[trackByField];
        if (key !== undefined && key !== null) {
            if (fastByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in fast array at path [${arrayPath}]. ` +
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
        const key = slowItem[trackByField];
        if (key === undefined || key === null) {
            // Item missing trackBy key - include slow item as-is
            result.push(slowItem);
            continue;
        }

        processedKeys.add(key);
        const fastItem = fastByKey.get(key);

        if (fastItem) {
            // Item exists in both: deep merge the item objects
            const mergedItem = deepMergeViewStates(slowItem, fastItem, trackByMap, arrayPath);
            result.push(mergedItem);
        } else {
            // Item only in slow
            result.push(slowItem);
        }
    }

    // Add items that only exist in fast
    for (const fastItem of fastArray) {
        const key = fastItem[trackByField];
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
