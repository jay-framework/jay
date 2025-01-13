export function stripMargin(str) {
    const regexp = new RegExp(`^[ \t]+\\|`, 'gm');
    return str.replace(regexp, '');
}
