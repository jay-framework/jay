export enum Import {
    jayElement,
    element,
    dynamicText,
    conditional
}

export class Imports {
    private readonly imports: Array<boolean>;

    constructor(newImports: Array<boolean>) {
        this.imports = newImports;
    }

    plus(addImport: Import) {
        let newImports: Array<boolean> = [...this.imports];
        newImports[addImport] = true;
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

    constructor(rendered: string, imports: Imports) {
        this.rendered = rendered;
        this.imports = imports;
    }

    map(f: (s: string) => string): RenderFragment {
        return new RenderFragment(f(this.rendered), this.imports);
    }

    static empty(): RenderFragment {
        return new RenderFragment('', Imports.none())
    }

    static merge(fragment1: RenderFragment, fragment2: RenderFragment): RenderFragment {
        if (!!fragment1.rendered && !!fragment2.rendered)
            return new RenderFragment(`${fragment1.rendered},\n${fragment2.rendered}`,
                Imports.merge(fragment1.imports, fragment2.imports))
        else if (!!fragment1.rendered)
            return fragment1
        else
            return fragment2;
    }
}