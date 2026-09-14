/**
 * Join CSS class names, dropping falsy values (empty strings left by unmatched
 * conditional classes, plus null / undefined / false). Compiler-generated class
 * expressions call this so a false conditional class never leaves stray, double,
 * or trailing whitespace in the resulting `class` attribute.
 */
export function classNames(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
