export enum RuntimeImport {
    jayElement,
    element,
    dynamicText,
    dynamicAttribute,
    dynamicProperty,
    conditional,
    dynamicElement,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    childComp,
    elemRef,
    elemCollectionRef,
    compRef,
    compCollectionRef,
    RenderElementOptions
}

export enum ImportsFor {
    definition, implementation
}

interface ImportStatementFragment {
    statement: string,
    usage: ImportsFor[]
}

const ImportsToStatements: Record<RuntimeImport, ImportStatementFragment> = {} as Record<RuntimeImport, ImportStatementFragment>;

function importStatementFragment(importKey: RuntimeImport, statement: string, ...usage: ImportsFor[]) {
    ImportsToStatements[importKey] = {statement, usage}
}

importStatementFragment(RuntimeImport.jayElement,'JayElement', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(RuntimeImport.element,'element as e', ImportsFor.implementation)
importStatementFragment(RuntimeImport.dynamicText,'dynamicText as dt', ImportsFor.implementation)
importStatementFragment(RuntimeImport.conditional,'conditional as c', ImportsFor.implementation)
importStatementFragment(RuntimeImport.dynamicElement,'dynamicElement as de', ImportsFor.implementation)
importStatementFragment(RuntimeImport.forEach,'forEach', ImportsFor.implementation)
importStatementFragment(RuntimeImport.ConstructContext,'ConstructContext', ImportsFor.implementation)
importStatementFragment(RuntimeImport.HTMLElementCollectionProxy, 'HTMLElementCollectionProxy', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(RuntimeImport.HTMLElementProxy, 'HTMLElementProxy', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(RuntimeImport.dynamicAttribute, 'dynamicAttribute as da', ImportsFor.implementation)
importStatementFragment(RuntimeImport.dynamicProperty, 'dynamicProperty as dp', ImportsFor.implementation)
importStatementFragment(RuntimeImport.childComp, 'childComp', ImportsFor.implementation)
importStatementFragment(RuntimeImport.elemRef, 'elemRef as er', ImportsFor.implementation)
importStatementFragment(RuntimeImport.elemCollectionRef, 'elemCollectionRef as ecr', ImportsFor.implementation)
importStatementFragment(RuntimeImport.compRef, 'compRef as cr', ImportsFor.implementation)
importStatementFragment(RuntimeImport.compCollectionRef, 'compCollectionRef as ccr', ImportsFor.implementation)
importStatementFragment(RuntimeImport.RenderElementOptions,'RenderElementOptions', ImportsFor.implementation, ImportsFor.definition)


export class Imports {
    private readonly imports: Array<boolean>;

    constructor(newImports: Array<boolean>) {
        this.imports = newImports;
    }

    plus(addImport: RuntimeImport | Imports): Imports {
        if (addImport instanceof Imports) {
            return Imports.merge(this, addImport)
        } else {
            let newImports: Array<boolean> = [...this.imports];
            newImports[addImport as number] = true;
            return new Imports(newImports)
        }
    }

    has(anImport: RuntimeImport) {
        return !!this.imports[anImport];
    }

    render(importsFor: ImportsFor) {
        let toBeRenderedImports = [];
        for (let importKey in RuntimeImport) {
            // iterate over Typescript enum numeric keys only (excluding string keys)
            if (!isNaN(Number(importKey)) && this.imports[importKey] && ImportsToStatements[importKey].usage.includes(importsFor))
                toBeRenderedImports.push(ImportsToStatements[importKey].statement)
        }
        return `import {${toBeRenderedImports.join(', ')}} from "jay-runtime";`;
    }

    static none(): Imports {
        return new Imports([]);
    }

    static for(...imports: Array<RuntimeImport>): Imports {
        let newImports = Imports.none();
        imports.forEach(anImport => newImports = newImports.plus(anImport))
        return newImports;
    }

    static merge(imports1: Imports, imports2: Imports) {
        let merged = [];
        for (let i = 0; i < Math.max(imports1.imports.length, imports2.imports.length); i++)
            merged[i] = imports1.imports[i] || imports2.imports[i];
        return new Imports(merged);
    }
}