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

export function mergeRefsTrees(...trees: RefsTree[]): RefsTree {
    const allRefs = trees.flatMap(tree => tree.refs);
    const allChildren: Record<string, RefsTree> = {};
    const allKeys = new Set(trees.flatMap(tree => Object.keys(tree.children)));

    for (const key of allKeys) {
        const childTrees = trees
            .filter(tree => tree.children[key] !== undefined)
            .map(tree => tree.children[key]);

        if (childTrees.length > 0) {
            allChildren[key] = mergeRefsTrees(...childTrees);
        }
    }
    const isRepeated = trees.some(tree => tree.repeated);
    return mkRefsTree(allRefs, allChildren, isRepeated);
}

export function hasRefs(refs: RefsTree, includingAutoRefs: boolean) {
    const onlyNonAutoRefs = (ref: Ref) => !ref.autoRef
    const allRefs = (ref: Ref) => true
    return refs.refs.filter(includingAutoRefs?allRefs:onlyNonAutoRefs).length > 0 ||
        refs.imported ||
        Object.entries(refs.children).map(([ref, refs]) => hasRefs(refs, includingAutoRefs))
            .reduce((prev, curr) => prev || curr, false);
}

export function nestRefs(path: string[], renderFragment: RenderFragment): RenderFragment {
    let refs = renderFragment.refs;
    for (let index = path.length - 1; index >= 0; --index) {
        refs = mkRefsTree([], {[path[index]]:refs}, refs.repeated)
    }
    return new RenderFragment(
        renderFragment.rendered,
        renderFragment.imports,
        renderFragment.validations,
        refs
    );
}


export function mkRefsTree(refs: Ref[], children: Record<string, RefsTree>, repeated: boolean = false, refsTypeName?: string, repeatedRefsTypeName?: string): RefsTree {
    if (refsTypeName)
        return {kind: 'refTree', refs, children, repeated, imported: {refsTypeName, repeatedRefsTypeName}};
    else
        return {kind: 'refTree', refs, children, repeated};
}

export interface Ref {
    readonly kind: 'ref',
    originalName: string,
    ref: string;
    constName: string;
    repeated: boolean;
    autoRef: boolean;
    viewStateType: JayType;
    elementType: JayType;
}

export function mkRef(ref: string,
                      originalName: string,
                      constName: string,
                      repeated: boolean,
                      autoRef: boolean,
                      viewStateType: JayType,
                      elementType: JayType
): Ref {
    return {
       kind: "ref", originalName, ref, constName, repeated, autoRef, viewStateType, elementType
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
        const newRefsTree = mergeRefsTrees(fragment1.refs, fragment2.refs);
        return new RenderFragment(
            rendered,
            Imports.merge(fragment1.imports, fragment2.imports),
            [...fragment1.validations, ...fragment2.validations],
            newRefsTree,
        );
    }
}
