import { JayValidations } from './with-validations';
import { Imports } from './imports';
import { JayType } from './jay-type';

export interface RefsTree {
    readonly kind: 'refTree',
    readonly refs: Ref[];
    readonly children: Record<string, RefsTree>;
}

export function refsTree(refs: Ref[], children: Record<string, RefsTree>): RefsTree {
    return {kind: 'refTree', refs, children};
}

export interface Ref {
    readonly kind: 'ref',
    ref: string;
    path: string[];
    constName: string;
    dynamicRef: boolean;
    autoRef: boolean;
    viewStateType: JayType;
    elementType: JayType;
}

export function ref(ref: string,
                    path: string[],
                    constName: string,
                    dynamicRef: boolean,
                    autoRef: boolean,
                    viewStateType: JayType,
                    elementType: JayType
): Ref {
    return {
       kind: "ref", ref, path, constName, dynamicRef, autoRef, viewStateType, elementType
    }
}

export class RenderFragment {
    rendered: string;
    imports: Imports;
    validations: JayValidations;
    refs: Array<Ref>;

    constructor(
        rendered: string,
        imports: Imports = Imports.none(),
        validations: JayValidations = [],
        refs: Array<Ref> = [],
    ) {
        this.rendered = rendered;
        this.imports = imports;
        this.validations = validations;
        this.refs = refs;
    }

    map(f: (s: string) => string): RenderFragment {
        return new RenderFragment(f(this.rendered), this.imports, this.validations, this.refs);
    }

    plusImport(imp: Imports): RenderFragment {
        return new RenderFragment(
            this.rendered,
            this.imports.plus(imp),
            this.validations,
            this.refs,
        );
    }

    static empty(): RenderFragment {
        return new RenderFragment('', Imports.none());
    }

    static merge(
        fragment1: RenderFragment,
        fragment2: RenderFragment,
        combinator: string = '',
    ): RenderFragment {
        let rendered =
            !!fragment1.rendered && !!fragment2.rendered
                ? `${fragment1.rendered}${combinator}${fragment2.rendered}`
                : !!fragment1.rendered
                  ? fragment1.rendered
                  : fragment2.rendered;
        return new RenderFragment(
            rendered,
            Imports.merge(fragment1.imports, fragment2.imports),
            [...fragment1.validations, ...fragment2.validations],
            [...fragment1.refs, ...fragment2.refs],
        );
    }
}
