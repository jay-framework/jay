import { camelCase as baseCamelCase } from 'change-case';

/**
 * Custom camelCase function that preserves leading underscores.
 * The standard camelCase from 'change-case' strips leading underscores
 * (e.g., '_id' becomes 'id'), which is undesirable for contract tag names
 * and jay-html data names.
 */
export function camelCase(str: string): string {
    // Count leading underscores
    let leadingUnderscores = 0;
    for (const char of str) {
        if (char === '_') {
            leadingUnderscores++;
        } else {
            break;
        }
    }

    if (leadingUnderscores === 0) {
        return baseCamelCase(str);
    }

    // Strip leading underscores, apply camelCase, then restore them
    const withoutLeadingUnderscores = str.slice(leadingUnderscores);
    const camelCased = baseCamelCase(withoutLeadingUnderscores);
    return '_'.repeat(leadingUnderscores) + camelCased;
}
