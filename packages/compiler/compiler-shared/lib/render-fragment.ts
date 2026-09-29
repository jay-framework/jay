import { JayValidations } from './with-validations';
import { Imports } from './imports';
import { JayType } from './jay-type';

export interface ImportedRefsTree {
    readonly refsTypeName: string;
    readonly repeatedRefsTypeName: string;
}

export interface RefsTree {
    readonly kind: 'refTree';
    readonly refs: Ref[];
    readonly children: Record<string, RefsTree>;
    readonly imported?: ImportedRefsTree;
    readonly repeated: boolean;
}

export function mergeRefsTrees(...trees: RefsTree[]): RefsTree {
    // Deduplicate refs by constName — the same ref appearing in multiple sibling
    // trees (e.g., forEach items) is the same binding, not separate refs.
    // When duplicates exist, prefer the repeated (collection) variant.
    // Only deduplicate when constName is set (some targets like react use null).
    const refsByConstName = new Map<string, Ref>();
    const refsWithoutConstName: Ref[] = [];
    for (const tree of trees) {
        for (const ref of tree.refs) {
            if (ref.constName == null) {
                refsWithoutConstName.push(ref);
            } else {
                const existing = refsByConstName.get(ref.constName);
                if (!existing || (!existing.repeated && ref.repeated)) {
                    refsByConstName.set(ref.constName, ref);
                }
            }
        }
    }
    const allRefs = [...refsWithoutConstName, ...refsByConstName.values()];
    const allChildren: Record<string, RefsTree> = {};
    const allKeys = new Set(trees.flatMap((tree) => Object.keys(tree.children)));

    for (const key of allKeys) {
        const childTrees = trees
            .filter((tree) => tree.children[key] !== undefined)
            .map((tree) => tree.children[key]);

        if (childTrees.length > 0) {
            allChildren[key] = mergeRefsTrees(...childTrees);
        }
    }
    const isRepeated = trees.some((tree) => tree.repeated);
    return mkRefsTree(allRefs, allChildren, isRepeated);
}

export function hasRefs(refs: RefsTree, includingAutoRefs: boolean) {
    const onlyNonAutoRefs = (ref: Ref) => !ref.autoRef;
    const allRefs = (ref: Ref) => true;
    return (
        refs.refs.filter(includingAutoRefs ? allRefs : onlyNonAutoRefs).length > 0 ||
        refs.imported ||
        Object.entries(refs.children)
            .map(([ref, refs]) => hasRefs(refs, includingAutoRefs))
            .reduce((prev, curr) => prev || curr, false)
    );
}

export function nestRefs(path: string[], renderFragment: RenderFragment): RenderFragment {
    let refs = renderFragment.refs;
    for (let index = path.length - 1; index >= 0; --index) {
        // Skip "." which is an identity accessor and doesn't represent a property path
        if (path[index] === '.') continue;
        refs = mkRefsTree([], { [path[index]]: refs }, refs.repeated);
    }
    return new RenderFragment(
        renderFragment.rendered,
        renderFragment.imports,
        renderFragment.validations,
        refs,
        renderFragment.recursiveRegions,
        renderFragment.parentDepth,
    );
}

/**
 * DL#198 Case 2 — hoist a region's free refs (matched by ref name) out of any nested (forEach) child
 * managers up to the top level of the region's ref tree. The runtime exposes the region's free refs via the
 * flat public API (`freeRefs['dismiss']`), and the page-side driver reads them by name — so a free ref that
 * lives inside the region's own forEach must be declared as a flat (elementCollection) ref rather than nested.
 * The ref's `constName` is unchanged, so the render body's `refDismiss()` invocation inside the forEach still
 * resolves; only the manager declaration and `getPublicAPI()` shape change. Children emptied by the hoist are
 * dropped so no empty child managers are emitted. Top-level free refs are already flat and are left in place.
 */
export function hoistFreeRefs(tree: RefsTree, freeRefNames: Set<string>): RefsTree {
    const hoisted: Ref[] = [];
    const stripChild = (child: RefsTree): RefsTree | undefined => {
        const keptRefs = child.refs.filter((ref) => {
            if (freeRefNames.has(ref.ref)) {
                hoisted.push(ref);
                return false;
            }
            return true;
        });
        const newChildren: Record<string, RefsTree> = {};
        for (const [key, grandChild] of Object.entries(child.children)) {
            const stripped = stripChild(grandChild);
            if (stripped) newChildren[key] = stripped;
        }
        const stillHasRefs = keptRefs.length > 0 || Object.keys(newChildren).length > 0;
        if (!stillHasRefs && !child.imported) return undefined;
        return mkRefsTree(
            keptRefs,
            newChildren,
            child.repeated,
            child.imported?.refsTypeName,
            child.imported?.repeatedRefsTypeName,
        );
    };
    const newChildren: Record<string, RefsTree> = {};
    for (const [key, child] of Object.entries(tree.children)) {
        const stripped = stripChild(child);
        if (stripped) newChildren[key] = stripped;
    }
    return mkRefsTree(
        [...tree.refs, ...hoisted],
        newChildren,
        tree.repeated,
        tree.imported?.refsTypeName,
        tree.imported?.repeatedRefsTypeName,
    );
}

export function mkRefsTree(
    refs: Ref[],
    children: Record<string, RefsTree>,
    repeated: boolean = false,
    refsTypeName?: string,
    repeatedRefsTypeName?: string,
): RefsTree {
    if (refsTypeName)
        return {
            kind: 'refTree',
            refs,
            children,
            repeated,
            imported: { refsTypeName, repeatedRefsTypeName },
        };
    else return { kind: 'refTree', refs, children, repeated };
}

// DL#198 — a region's free ref (a region-body element ref not declared by the region's contract). `repeated`
// is true when the free ref lives inside the region's own forEach (Case 2), so the page must expose it as an
// elementCollection even for a single region.
export interface FreeRefDecl {
    name: string;
    repeated: boolean;
    // DL#198 (design point 3) — type info for augmenting the page-side region ref so
    // `refs.<regionRef>.<freeRef>` is typed as an element proxy carrying the free ref's viewState.
    viewStateType?: string;
    elementType?: string;
}

// DL#198 (design point 3) — build the page-side region ref type augmented with its free refs.
// Each free ref becomes an `HTMLElementProxy<VS, El>` (or `HTMLElementCollectionProxy<...>` when the
// region is a collection OR the free ref is repeated), intersected onto the region's contract ref type.
export interface FreeRefAugmentedType {
    type: string;
    needsElementProxy: boolean;
    needsCollectionProxy: boolean;
}

export function freeRefsAugmentedRefType(
    contractRefType: string,
    freeRefs: FreeRefDecl[],
    regionIsCollection: boolean,
): FreeRefAugmentedType {
    if (!freeRefs.length)
        return { type: contractRefType, needsElementProxy: false, needsCollectionProxy: false };
    let needsElementProxy = false;
    let needsCollectionProxy = false;
    const parts = freeRefs.map((f) => {
        const collection = regionIsCollection || f.repeated;
        if (collection) needsCollectionProxy = true;
        else needsElementProxy = true;
        const proxy = collection ? 'HTMLElementCollectionProxy' : 'HTMLElementProxy';
        return `${f.name}: ${proxy}<${f.viewStateType}, ${f.elementType}>`;
    });
    return {
        type: `${contractRefType} & { ${parts.join('; ')} }`,
        needsElementProxy,
        needsCollectionProxy,
    };
}

export interface Ref {
    readonly kind: 'ref';
    originalName: string;
    ref: string;
    constName: string;
    repeated: boolean;
    autoRef: boolean;
    viewStateType: JayType;
    elementType: JayType;
    // DL#198 — for a component (region) ref, the region's free refs. Drives the per-region
    // FreeReferenceManager emitted alongside the region ref so the aggregate resolves them as boundary event
    // sources (`refs.<regionRef>.<freeRef>.<domEvent>`).
    freeRefs?: FreeRefDecl[];
}

export function mkRef(
    ref: string,
    originalName: string,
    constName: string,
    repeated: boolean,
    autoRef: boolean,
    viewStateType: JayType,
    elementType: JayType,
    freeRefs?: FreeRefDecl[],
): Ref {
    return {
        kind: 'ref',
        originalName,
        ref,
        constName,
        repeated,
        autoRef,
        viewStateType,
        elementType,
        freeRefs,
    };
}

export interface RecursiveRegion {
    refName: string;
    renderedContent: string;
    viewStateType: string;
}

export class RenderFragment {
    rendered: string;
    imports: Imports;
    validations: JayValidations;
    refs: RefsTree;
    recursiveRegions: RecursiveRegion[];
    /**
     * DL#193 Capability A: the deepest `$parent` climb referenced in this fragment
     * (0 = none, 1 = `$parent.`, 2 = `$parent.$parent.`, …). The closure-emitting
     * grammar rules read this to widen the binding signature with parent params
     * (`(vs, _p1, _p2) => …`) that the runtime supplies from the live parent context.
     */
    parentDepth: number;

    constructor(
        rendered: string,
        imports: Imports = Imports.none(),
        validations: JayValidations = [],
        refs: RefsTree = mkRefsTree([], {}),
        recursiveRegions: RecursiveRegion[] = [],
        parentDepth: number = 0,
    ) {
        this.rendered = rendered;
        this.imports = imports;
        this.validations = validations;
        this.refs = refs;
        this.recursiveRegions = recursiveRegions;
        this.parentDepth = parentDepth;
    }

    map(f: (s: string) => string): RenderFragment {
        return new RenderFragment(
            f(this.rendered),
            this.imports,
            this.validations,
            this.refs,
            this.recursiveRegions,
            this.parentDepth,
        );
    }

    plusImport(imp: Imports): RenderFragment {
        return new RenderFragment(
            this.rendered,
            this.imports.plus(imp),
            this.validations,
            this.refs,
            this.recursiveRegions,
            this.parentDepth,
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
            [...fragment1.recursiveRegions, ...fragment2.recursiveRegions],
            Math.max(fragment1.parentDepth, fragment2.parentDepth),
        );
    }
}
