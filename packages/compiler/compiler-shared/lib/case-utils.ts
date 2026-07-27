import { camelCase as baseCamelCase } from 'change-case';

/**
 * camelCase that preserves leading underscores.
 * The standard camelCase from 'change-case' strips them
 * (e.g., '_id' becomes 'id'), which breaks contract tag names.
 */
export function camelCase(str: string): string {
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

    const withoutLeadingUnderscores = str.slice(leadingUnderscores);
    const camelCased = baseCamelCase(withoutLeadingUnderscores);
    return '_'.repeat(leadingUnderscores) + camelCased;
}
