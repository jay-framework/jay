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
} from '@jay-framework/compiler-shared';

export function renderImports(
    imports: Imports,
    importsFor: ImportsFor,
    componentImports: Array<JayImportLink>,
    importerMode: RuntimeMode,
): string {
    const runtimeImport = imports.render(importsFor);

    // DL#205: two headless imports can back the same contract module (e.g. two design variants of one
    // contract, one aliased with `as=`). Each contributes its own import link, so merge links by module
    // (+ sandbox) and dedup symbols — otherwise the same name is imported twice from one module, which is a
    // `Duplicate identifier` TypeScript error. Preserve first-seen module and symbol order for stable output.
    const mergedByModulemergedByModulemergedByModule = new Map<string, { link: JayImportLink; symbols: Set<string> }>();
    for (const importStatement of componentImports) {
        const key = `${importStatement.sandbox ? 'sandbox:' : ''}${importStatement.module}`;
        let entry = mergedByModule.get(key);
        if (!entry) {
            entry = { link: { ...importStatement, names: [] }, symbols: new Set<string>() };
            mergedByModule.set(key, entry);
        }
        for (const symbol of importStatement.names) {
            const rendered = symbol.as ? `${symbol.name} as ${symbol.as}` : symbol.name;
            if (entry.symbols.has(rendered)) continue;
            entry.symbols.add(rendered);
            entry.link.names.push(symbol);
        }
    }

    // todo validate the actual imported file
    let renderedComponentImports = [...mergedByModule.values()].map(({ link }) => {
        let symbols = link.names
            .map((symbol) => (symbol.as ? `${symbol.name} as ${symbol.as}` : symbol.name))
            .join(', ');

        return `import {${symbols}} from "${link.module}${getModeFileExtension(
            link.sandbox,
            importerMode,
        )}";`;
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
