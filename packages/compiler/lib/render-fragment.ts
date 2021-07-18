import {JayValidations} from "./with-validations";

export enum Import {
    jayElement,
    element,
    dynamicText,
    conditional,
    dynamicElement,
    forEach,
    ConstructContext
}

export class Imports {
    private readonly imports: Array<boolean>;

    constructor(newImports: Array<boolean>) {
        this.imports = newImports;
    }

    plus(addImport: Import | Imports) {
        let newImports: Array<boolean> = [...this.imports];
        if (addImport instanceof Imports) {
            newImports = [...addImport.imports];
        }
        else {
            newImports[addImport as number] = true;
        }
        return new Imports(newImports)
    }

    has(anImport: Import) {
        return !!this.imports[anImport];
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

export class RenderFragment {
    rendered: string;
    imports: Imports;
    validations: JayValidations;

    constructor(rendered: string, imports: Imports, validations: JayValidations = []) {
        this.rendered = rendered;
        this.imports = imports;
        this.validations = validations
    }

    map(f: (s: string) => string): RenderFragment {
        return new RenderFragment(f(this.rendered), this.imports, this.validations);
    }

    static empty(): RenderFragment {
        return new RenderFragment('', Imports.none())
    }

    static merge(fragment1: RenderFragment, fragment2: RenderFragment, combinator: string =''): RenderFragment {
        if (!!fragment1.rendered && !!fragment2.rendered)
            return new RenderFragment(`${fragment1.rendered}${combinator}${fragment2.rendered}`,
                Imports.merge(fragment1.imports, fragment2.imports),
                [...fragment1.validations, ...fragment2.validations])
        else if (!!fragment1.rendered)
            return fragment1
        else
            return fragment2;
    }
}