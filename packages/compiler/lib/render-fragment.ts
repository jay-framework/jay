import {JayValidations} from "./with-validations";
import {JayType} from "./parse-jay-file";

export enum Import {
    jayElement,
    element,
    dynamicText,
    conditional,
    dynamicElement,
    forEach,
    ConstructContext,
    DynamicReference,
    dynamicAttribute,
    dynamicProperty,
    childComp
}

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
    refType: JayType
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