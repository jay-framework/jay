
export enum ImportsFor {
    definition, implementation
}

interface ImportName {
    index: number,
    statement: string,
    module: string,
    usage: ImportsFor[]
}

type PackageImports = Record<string, ImportName>

function mkImports(): PackageImports {
    let ImportsToStatements: PackageImports = {} as PackageImports;
    let nextKey = 0;
    function importStatementFragment(module: string, key: string, statement: string, ...usage: ImportsFor[]) {
        ImportsToStatements[key] = {module, index: nextKey++, statement, usage}
    }

    importStatementFragment('jay-runtime', 'jayElement','JayElement', ImportsFor.definition, ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'element','element as e', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'dynamicText','dynamicText as dt', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'dynamicAttribute', 'dynamicAttribute as da', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'dynamicProperty', 'dynamicProperty as dp', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'conditional','conditional as c', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'dynamicElement','dynamicElement as de', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'forEach','forEach', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'ConstructContext','ConstructContext', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'HTMLElementCollectionProxy', 'HTMLElementCollectionProxy', ImportsFor.definition, ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'HTMLElementProxy', 'HTMLElementProxy', ImportsFor.definition, ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'childComp', 'childComp', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'elemRef', 'elemRef as er', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'elemCollectionRef', 'elemCollectionRef as ecr', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'compRef', 'compRef as cr', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'compCollectionRef', 'compCollectionRef as ccr', ImportsFor.implementation)
    importStatementFragment('jay-runtime', 'RenderElementOptions','RenderElementOptions', ImportsFor.implementation, ImportsFor.definition)
    return ImportsToStatements;
}
export const Import: PackageImports = mkImports();

export class Imports {
    constructor(private readonly imports: Array<boolean>) {}

    plus(addImport: ImportName | Imports): Imports {
        if (addImport instanceof Imports) {
            return Imports.merge(this, addImport)
        } else {
            let newImports: Array<boolean> = [...this.imports];
            newImports[addImport.index] = true;
            return new Imports(newImports)
        }
    }

    has(anImport: ImportName) {
        return !!this.imports[anImport.index];
    }

    render(importsFor: ImportsFor) {
        let toBeRenderedImports = [];
        for (let importKey in Import) {
            let importName = Import[importKey];
            if (this.imports[importName.index] && importName.usage.includes(importsFor))
                toBeRenderedImports.push(importName.statement)
        }
        return `import {${toBeRenderedImports.join(', ')}} from "jay-runtime";`;
    }

    static none(): Imports {
        return new Imports([]);
    }

    static for(...imports: Array<ImportName>): Imports {
        let newImports = Imports.none();
        imports.forEach(anImport => newImports = newImports.plus(anImport))
        return newImports;
    }

    static merge(imports1: Imports, imports2: Imports): Imports {
        let merged = [];
        for (let i = 0; i < Math.max(imports1.imports.length, imports2.imports.length); i++)
            merged[i] = imports1.imports[i] || imports2.imports[i];
        return new Imports(merged);
    }
}