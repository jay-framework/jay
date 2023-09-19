
export enum ImportsFor {
    definition, implementation, elementBridge
}

interface ImportName {
    index: number,
    statement: string,
    module: string,
    usage: ImportsFor[]
}

let nextKey = 0;
function importStatementFragment(module: string, statement: string, ...usage: ImportsFor[]) {
    return {module, index: nextKey++, statement, usage}
}

export const Import = {
    jayElement: importStatementFragment('jay-runtime','JayElement', ImportsFor.definition, ImportsFor.implementation, ImportsFor.elementBridge),
    element: importStatementFragment('jay-runtime', 'element as e', ImportsFor.implementation),
    dynamicText: importStatementFragment('jay-runtime', 'dynamicText as dt', ImportsFor.implementation),
    dynamicAttribute: importStatementFragment('jay-runtime',  'dynamicAttribute as da', ImportsFor.implementation),
    dynamicProperty: importStatementFragment('jay-runtime',  'dynamicProperty as dp', ImportsFor.implementation),
    conditional: importStatementFragment('jay-runtime', 'conditional as c', ImportsFor.implementation),
    dynamicElement: importStatementFragment('jay-runtime', 'dynamicElement as de', ImportsFor.implementation),
    forEach: importStatementFragment('jay-runtime', 'forEach', ImportsFor.implementation),
    ConstructContext: importStatementFragment('jay-runtime', 'ConstructContext', ImportsFor.implementation),
    HTMLElementCollectionProxy: importStatementFragment('jay-runtime',  'HTMLElementCollectionProxy', ImportsFor.definition, ImportsFor.implementation, ImportsFor.elementBridge),
    HTMLElementProxy: importStatementFragment('jay-runtime',  'HTMLElementProxy', ImportsFor.definition, ImportsFor.implementation, ImportsFor.elementBridge),
    childComp: importStatementFragment('jay-runtime',  'childComp', ImportsFor.implementation),
    elemRef: importStatementFragment('jay-runtime',  'elemRef as er', ImportsFor.implementation),
    elemCollectionRef: importStatementFragment('jay-runtime',  'elemCollectionRef as ecr', ImportsFor.implementation),
    compRef: importStatementFragment('jay-runtime',  'compRef as cr', ImportsFor.implementation),
    compCollectionRef: importStatementFragment('jay-runtime',  'compCollectionRef as ccr', ImportsFor.implementation),
    RenderElementOptions: importStatementFragment('jay-runtime', 'RenderElementOptions', ImportsFor.implementation, ImportsFor.definition),
    sandboxElementBridge: importStatementFragment('jay-secure', 'elementBridge', ImportsFor.elementBridge),
    sandboxElement: importStatementFragment('jay-secure', 'sandboxElement as e', ImportsFor.elementBridge),
    sandboxChildComp: importStatementFragment('jay-secure', 'sandboxChildComp as childComp', ImportsFor.elementBridge),
    sandboxElemRef: importStatementFragment('jay-secure', 'elemRef as er', ImportsFor.elementBridge),
    sandboxElemCollectionRef: importStatementFragment('jay-secure', 'elemCollectionRef as ecr', ImportsFor.elementBridge),
    sandboxCompRef: importStatementFragment('jay-secure', 'compRef as cr', ImportsFor.elementBridge),
    sandboxCompCollectionRef: importStatementFragment('jay-secure', 'compCollectionRef as ccr', ImportsFor.elementBridge),
    sandboxForEach: importStatementFragment('jay-secure', 'sandboxForEach as forEach', ImportsFor.elementBridge),

}

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
        let moduleImportStatements = [];
        moduleImportStatements.push(this.renderModule(importsFor, 'jay-runtime'))
        moduleImportStatements.push(this.renderModule(importsFor, 'jay-secure'))
        return moduleImportStatements
            .filter(_ => !!_)
            .join('\n')
    }

    renderModule(importsFor: ImportsFor, module: string) {
        let toBeRenderedImports = [];
        for (let importKey in Import) {
            let importName = Import[importKey];
            if (this.imports[importName.index] && importName.usage.includes(importsFor) && importName.module === module)
                toBeRenderedImports.push(importName.statement)
        }
        if (toBeRenderedImports.length > 0)
            return `import {${toBeRenderedImports.join(', ')}} from "${module}";`;
        else
            return undefined;
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