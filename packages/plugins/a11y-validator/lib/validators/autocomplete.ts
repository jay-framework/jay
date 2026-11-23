/** The HTML autofill grammar (DL#240 §2), case-insensitive. */

const FIELD_NAMES = new Set(
    (
        'name honorific-prefix given-name additional-name family-name honorific-suffix nickname username ' +
        'new-password current-password one-time-code organization-title organization street-address ' +
        'address-line1 address-line2 address-line3 address-level4 address-level3 address-level2 address-level1 ' +
        'country country-name postal-code cc-name cc-given-name cc-additional-name cc-family-name cc-number ' +
        'cc-exp cc-exp-month cc-exp-year cc-csc cc-type transaction-currency transaction-amount language bday ' +
        'bday-day bday-month bday-year sex url photo'
    ).split(' '),
);

const CONTACT_FIELD_NAMES = new Set(
    'tel tel-country-code tel-national tel-area-code tel-local tel-extension email impp'.split(' '),
);

const ADDRESS_MODIFIERS = new Set(['shipping', 'billing']);
const CONTACT_MODIFIERS = new Set(['home', 'work', 'mobile', 'fax', 'pager']);

const TYPO_FIXES = new Map([
    ['phone', 'tel'],
    ['zip', 'postal-code'],
    ['firstname', 'given-name'],
    ['nope', 'off'],
    ['false', 'off'],
]);

export function tokensOf(value: string): string[] {
    return value.trim().split(/\s+/).filter(Boolean);
}

export function isValidAutocomplete(value: string): boolean {
    const tokens = tokensOf(value.toLowerCase());
    if (tokens.length === 1 && (tokens[0] === 'on' || tokens[0] === 'off')) return true;
    let i = 0;
    if (tokens[i]?.startsWith('section-')) i++;
    if (ADDRESS_MODIFIERS.has(tokens[i])) i++;
    const contactModifier = CONTACT_MODIFIERS.has(tokens[i]);
    if (contactModifier) i++;
    const field = tokens[i++];
    const isField = contactModifier
        ? CONTACT_FIELD_NAMES.has(field)
        : FIELD_NAMES.has(field) || CONTACT_FIELD_NAMES.has(field);
    if (!isField) return false;
    if (tokens[i] === 'webauthn') i++;
    return i === tokens.length;
}

/** The single-token typo fix (`phone` → `tel`), when the value is a known typo. */
export function autocompleteTypoFix(value: string): string | undefined {
    const tokens = tokensOf(value.toLowerCase());
    return tokens.length === 1 ? TYPO_FIXES.get(tokens[0]) : undefined;
}
