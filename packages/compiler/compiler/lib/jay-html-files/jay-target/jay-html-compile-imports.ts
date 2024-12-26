import {
    getModeFileExtension,
    Imports,
    ImportsFor,
    JayComponentType,
    JayImportedType,
    JayImportLink,
    RuntimeMode
} from "jay-compiler-shared";

export function renderImports(
    imports: Imports,
    importsFor: ImportsFor,
    componentImports: Array<JayImportLink>,
    refImportsInUse: Set<string>,
    importerMode: RuntimeMode,
): string {
    const runtimeImport = imports.render(importsFor);

    // todo validate the actual imported file
    let renderedComponentImports = componentImports.map((importStatement) => {
        let symbols = importStatement.names
            .map((symbol) => (symbol.as ? `${symbol.name} as ${symbol.as}` : symbol.name))
            .join(', ');

        let imports = [];
        importStatement.names
            .filter(
                (symbol) =>
                    symbol.type instanceof JayImportedType &&
                    symbol.type.type instanceof JayComponentType,
            )
            .map((symbol) => ((symbol.type as JayImportedType).type as JayComponentType).name)
            .filter(
                (compType) =>
                    refImportsInUse.has(compType + 'ComponentType') ||
                    refImportsInUse.has(compType + 'Refs'),
            )
            .map((compType) => {
                let importSymbols = [];
                if (refImportsInUse.has(compType + 'ComponentType'))
                    importSymbols.push(compType + 'ComponentType');
                if (refImportsInUse.has(compType + 'Refs')) importSymbols.push(compType + 'Refs');
                imports.push(
                    `import {${importSymbols.join(', ')}} from "${importStatement.module}-refs";`,
                );
            });
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
        {importedSymbols: new Set<string>(), importedSandboxedSymbols: new Set<string>()},
    );
}