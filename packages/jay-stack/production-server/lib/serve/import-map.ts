export function buildImportMap(
    sharedManifest: Record<string, string>,
    publicBasePath: string,
    sharedDir: string = 'shared',
): Record<string, string> {
    const imports: Record<string, string> = {};
    for (const [pkgName, hashedFile] of Object.entries(sharedManifest)) {
        imports[pkgName] = `${publicBasePath}${sharedDir}/${hashedFile}`;
    }
    return imports;
}
