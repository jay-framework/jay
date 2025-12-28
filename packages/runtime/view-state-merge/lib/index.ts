/**
 * Type alias for trackBy map: maps property paths to trackBy field names.
 * Example: { "items": "id", "products.variants": "sku" }
 */
export type TrackByMap = Record<string, string>;

/**
 * Deep merge two view states using trackBy metadata for arrays.
 * Used to combine view states from different rendering phases (slow + fast)
 * or to merge default view state with interactive updates.
 *
 * @param base - Base ViewState (e.g., slow render result or default view state)
 * @param overlay - Overlay ViewState (e.g., fast render result or interactive updates)
 * @param trackByMap - Map from property path to trackBy field name (e.g., {"items": "id"})
 * @param path - Current property path (used for recursion)
 * @returns Merged ViewState combining properties from both inputs
 */
export function deepMergeViewStates(
    base: object | undefined,
    overlay: object | undefined,
    trackByMap: TrackByMap,
    path: string = '',
): object {
    if (!base && !overlay) return {};
    if (!base) return overlay || {};
    if (!overlay) return base || {};

    const result: any = {};
    const allKeys = new Set([...Object.keys(base), ...Object.keys(overlay)]);

    for (const key of allKeys) {
        const baseValue = (base as any)[key];
        const overlayValue = (overlay as any)[key];
        const currentPath = path ? `${path}.${key}` : key;

        if (overlayValue === undefined) {
            // Only in base
            result[key] = baseValue;
        } else if (baseValue === undefined) {
            // Only in overlay
            result[key] = overlayValue;
        } else if (Array.isArray(baseValue) && Array.isArray(overlayValue)) {
            // Array: check if we have trackBy info for this path
            const trackByField = trackByMap[currentPath];
            if (trackByField) {
                result[key] = mergeArraysByTrackBy(
                    baseValue,
                    overlayValue,
                    trackByField,
                    trackByMap,
                    currentPath,
                );
            } else {
                // No trackBy info - use overlay array
                result[key] = overlayValue;
            }
        } else if (
            typeof baseValue === 'object' &&
            baseValue !== null &&
            typeof overlayValue === 'object' &&
            overlayValue !== null &&
            !Array.isArray(baseValue) &&
            !Array.isArray(overlayValue)
        ) {
            // Nested object: recurse
            result[key] = deepMergeViewStates(baseValue, overlayValue, trackByMap, currentPath);
        } else {
            // Primitive or conflicting types: overlay wins
            result[key] = overlayValue;
        }
    }

    return result;
}

/**
 * Merge two arrays using trackBy to match items by identity
 */
function mergeArraysByTrackBy(
    baseArray: any[],
    overlayArray: any[],
    trackByField: string,
    trackByMap: TrackByMap,
    arrayPath: string,
): any[] {
    // Build index of base items by trackBy key
    const baseByKey = new Map<string | number, any>();
    for (const item of baseArray) {
        const key = item[trackByField];
        if (key !== undefined && key !== null) {
            if (baseByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in base array at path [${arrayPath}]. ` +
                        `This may cause incorrect merging.`,
                );
            }
            baseByKey.set(key, item);
        }
    }

    // Build index of overlay items by trackBy key
    const overlayByKey = new Map<string | number, any>();
    for (const item of overlayArray) {
        const key = item[trackByField];
        if (key !== undefined && key !== null) {
            if (overlayByKey.has(key)) {
                console.warn(
                    `Duplicate trackBy key [${key}] in overlay array at path [${arrayPath}]. ` +
                        `This may cause incorrect merging.`,
                );
            }
            overlayByKey.set(key, item);
        }
    }

    // Merge: Start with base array order, merge matching overlay items
    const result: any[] = [];
    const processedKeys = new Set<string | number>();

    for (const baseItem of baseArray) {
        const key = baseItem[trackByField];
        if (key === undefined || key === null) {
            // Item missing trackBy key - include base item as-is
            result.push(baseItem);
            continue;
        }

        processedKeys.add(key);
        const overlayItem = overlayByKey.get(key);

        if (overlayItem) {
            // Item exists in both: deep merge the item objects
            const mergedItem = deepMergeViewStates(baseItem, overlayItem, trackByMap, arrayPath);
            result.push(mergedItem);
        } else {
            // Item only in base
            result.push(baseItem);
        }
    }

    // Add items that only exist in overlay
    for (const overlayItem of overlayArray) {
        const key = overlayItem[trackByField];
        if (key === undefined || key === null) {
            // Item missing trackBy key - include overlay item as-is
            result.push(overlayItem);
            continue;
        }

        if (!processedKeys.has(key)) {
            result.push(overlayItem);
        }
    }

    return result;
}

