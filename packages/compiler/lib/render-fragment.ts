import {JayValidations} from "./with-validations";
import {JayType} from "./parse-jay-file";

export enum Import {
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
    compCollectionRef
}

export enum ImportsFor {
    definition, implementation
}

interface ImportStatementFragment {
    statement: string,
    usage: ImportsFor[]
}

const ImportsToStatements: Record<Import, ImportStatementFragment> = {} as Record<Import, ImportStatementFragment>;
function importStatementFragment(importKey: Import, statement: string, ...usage: ImportsFor[]) {
    ImportsToStatements[importKey] = {statement, usage}
}
importStatementFragment(Import.jayElement,'JayElement', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(Import.element,'element as e', ImportsFor.implementation)
importStatementFragment(Import.dynamicText,'dynamicText as dt', ImportsFor.implementation)
importStatementFragment(Import.conditional,'conditional as c', ImportsFor.implementation)
importStatementFragment(Import.dynamicElement,'dynamicElement as de', ImportsFor.implementation)
importStatementFragment(Import.forEach,'forEach', ImportsFor.implementation)
importStatementFragment(Import.ConstructContext,'ConstructContext', ImportsFor.implementation)
importStatementFragment(Import.HTMLElementCollectionProxy, 'HTMLElementCollectionProxy', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(Import.HTMLElementProxy, 'HTMLElementProxy', ImportsFor.definition, ImportsFor.implementation)
importStatementFragment(Import.dynamicAttribute, 'dynamicAttribute as da', ImportsFor.implementation)
importStatementFragment(Import.dynamicProperty, 'dynamicProperty as dp', ImportsFor.implementation)
importStatementFragment(Import.childComp, 'childComp', ImportsFor.implementation)
importStatementFragment(Import.elemRef, 'elemRef as er', ImportsFor.implementation)
importStatementFragment(Import.elemCollectionRef, 'elemCollectionRef as ecr', ImportsFor.implementation)
importStatementFragment(Import.compRef, 'compRef as cr', ImportsFor.implementation)
importStatementFragment(Import.compCollectionRef, 'compCollectionRef as ccr', ImportsFor.implementation)


export class Imports {
    private readonly imports: Array<boolean>;

    constructor(newImports: Array<boolean>) {
        this.imports = newImports;
    }

    plus(addImport: Import | Imports): Imports {
        if (addImport instanceof Imports) {
            return Imports.merge(this, addImport)
        }
        else {
            let newImports: Array<boolean> = [...this.imports];
            newImports[addImport as number] = true;
            return new Imports(newImports)
        }
    }

    has(anImport: Import) {
        return !!this.imports[anImport];
    }

    render(importsFor: ImportsFor) {
        let toBeRenderedImports = [];
        for (let importKey in Import) {
            // iterate over Typescript enum numeric keys only (excluding string keys)
            if (!isNaN(Number(importKey)) && this.imports[importKey] && ImportsToStatements[importKey].usage.includes(importsFor))
                toBeRenderedImports.push(ImportsToStatements[importKey].statement)
        }
        toBeRenderedImports.push('RenderElementOptions')
        return `import {${toBeRenderedImports.join(', ')}} from "jay-runtime";`;
    }

    static none(): Imports {
        return new Imports([]);
    }

    static for(...imports: Array<Import>): Imports {
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

export interface Ref {
    ref: string,
    dynamicRef: boolean,
    viewStateType: JayType
    elementType: JayType
}

export class RenderFragment {
    rendered: string;
    imports: Imports;
    validations: JayValidations;
    refs: Array<Ref>;

    constructor(rendered: string, imports: Imports = Imports.none(), validations: JayValidations = [], refs: Array<Ref> = []) {
        this.rendered = rendered;
        this.imports = imports;
        this.validations = validations
        this.refs = refs;
    }

    map(f: (s: string) => string): RenderFragment {
        return new RenderFragment(f(this.rendered), this.imports, this.validations, this.refs);
    }

    plusImport(imp: Import): RenderFragment {
        return new RenderFragment(this.rendered, this.imports.plus(imp), this.validations, this.refs);
    }

    static empty(): RenderFragment {
        return new RenderFragment('', Imports.none())
    }

    static merge(fragment1: RenderFragment, fragment2: RenderFragment, combinator: string =''): RenderFragment {
        let rendered = (!!fragment1.rendered && !!fragment2.rendered) ?
            `${fragment1.rendered}${combinator}${fragment2.rendered}` :
            (!!fragment1.rendered) ?
                fragment1.rendered : fragment2.rendered;
        return new RenderFragment(rendered,
            Imports.merge(fragment1.imports, fragment2.imports),
            [...fragment1.validations, ...fragment2.validations],
            [...fragment1.refs, ...fragment2.refs])
    }
}