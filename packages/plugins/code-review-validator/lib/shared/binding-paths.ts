/**
 * Extract dot-separated identifier paths from a jay-html binding expression (text inside `{…}`, without braces).
 *
 * Heuristic scan only — not a full expression parse. Every token that looks like `foo` or `foo.bar` is returned.
 *
 * @example
 * bindingPathsFromExpression('title') // => ['title']
 * bindingPathsFromExpression('user.displayName') // => ['user.displayName']
 * bindingPathsFromExpression('isOpen && panel.visible') // => ['isOpen', 'panel.visible']
 */
export function bindingPathsFromExpression(expression: string): string[] {
    const paths: string[] = [];
    const re = /\b([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(expression)) !== null) {
        paths.push(match[1]);
    }
    return paths;
}
