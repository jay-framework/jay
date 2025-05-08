import { JayValidations } from './with-validations';
import { Imports } from './imports';
import { JayType } from './jay-type';

export interface ImportedRefsTree {
    readonly refsTypeName: string;
    readonly repeatedRefsTypeName: string;
}

export interface RefsTree {
    readonly kind: 'refTree',
    readonly refs: Ref[];
    readonly children: Record<string, RefsTree>;
    readonly imported?: ImportedRefsTree
    readonly repeated: boolean
}

export function mkRefsTree(refs: Ref[], children: Record<string, RefsTree>, repeated: boolean = false, refsTypeName?: string, repeatedRefsTypeName?: string): RefsTree {
    if (refsTypeName)
        return {kind: 'refTree', refs, children, repeated, imported: {refsTypeName, repeatedRefsTypeName}};
    else
        return {kind: 'refTree', refs, children, repeated};
}

export interface Ref {
    readonly kind: 'ref',
    ref: string;
    constName: string;
    dynamicRef: boolean;
    autoRef: boolean;
    viewStateType: JayType;
    elementType: JayType;
}

export function mkRef(ref: string,
                    constName: string,
                    dynamicRef: boolean,
                    autoRef: boolean,
                    viewStateType: JayType,
                    elementType: JayType
): Ref {
    return {
       kind: "ref", ref, constName, dynamicRef, autoRef, viewStateType, elementType
    }
}

export class RenderFragment {
    rendered: string;
    imports: Imports;
    validations: JayValidations;
    refs: RefsTree;

    constructor(
        rendered: string,
        imports: Imports = Imports.none(),
        validations: JayValidations = [],
        refs: RefsTree = mkRefsTree([], {}),
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
        const rendered =
            !!fragment1.rendered && !!fragment2.rendered
                ? `${fragment1.rendered}${combinator}${fragment2.rendered}`
                : !!fragment1.rendered
                  ? fragment1.rendered
                  : fragment2.rendered;
        const newRefsTree = mkRefsTree(
            [...fragment1.refs.refs, ...fragment2.refs.refs],
            {...fragment1.refs.children, ...fragment2.refs.children},
            fragment1.refs.repeated
            )
        return new RenderFragment(
            rendered,
            Imports.merge(fragment1.imports, fragment2.imports),
            [...fragment1.validations, ...fragment2.validations],
            newRefsTree,
        );
    }
}
