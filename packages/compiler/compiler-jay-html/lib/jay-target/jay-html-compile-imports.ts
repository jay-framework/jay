import {
    getModeFileExtension,
    Imports,
    ImportsFor,
    isComponentType,
    isImportedType,
    JayComponentType,
    JayImportedType,
    JayImportLink,
    RuntimeMode,
} from 'jay-compiler-shared';

export function renderImports(
    imports: Imports,
    importsFor: ImportsFor,
    componentImports: Array<JayImportLink>,
    importerMode: RuntimeMode,
): string {
    const runtimeImport = imports.render(importsFor);

    // todo validate the actual imported file
    let renderedComponentImports = componentImports.map((importStatement) => {
        let symbols = importStatement.names
            .map((symbol) => (symbol.as ? `${symbol.name} as ${symbol.as}` : symbol.name))
            .join(', ');

        let imports = [];
        imports.push(
            `import {${symbols}} from "${importStatement.module}${getModeFileExtension(
                importStatement.sandbox,
                importerMode,
            )}";`,
        );
        return imports.join('\n');
    });

    return [runtimeImport, ...renderedComponentImports].join('\n');
}

export function processImportedComponents(importStatements: JayImportLink[]) {
    return importStatements.reduce(
        (processedImports, importStatement) => {
            importStatement.names.forEach((importName) => {
                let name = importName.as || importName.name;
                processedImports.importedSymbols.add(name);
                if (importStatement.sandbox) processedImports.importedSandboxedSymbols.add(name);
            });
            return processedImports;
        },
        { importedSymbols: new Set<string>(), importedSandboxedSymbols: new Set<string>() },
    );
}
