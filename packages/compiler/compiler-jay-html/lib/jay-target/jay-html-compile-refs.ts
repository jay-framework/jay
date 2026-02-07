import {
    equalJayTypes,
    GenerateTarget,
    Import,
    Imports,
    JayComponentType,
    JayHTMLType,
    JayType,
    JayTypeAlias,
    JayUnionType,
    mkRefsTree,
    Ref,
    RefsTree,
    RenderFragment,
    hasRefs,
    mkRef,
} from '@jay-framework/compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { htmlElementTagNameMap } from './html-element-tag-name-map';
import { camelCase } from '../case-utils';
import { Indent } from './indent';
import { JayHeadlessImports } from './jay-html-source-file';
import { Variables } from '../expressions/expression-compiler';

const isComponentRef = (ref: Ref) =>
    ref.elementType instanceof JayComponentType || ref.elementType instanceof JayTypeAlias;
const isCollectionRef = (ref: Ref) => ref.repeated;
const isComponentCollectionRef = (ref: Ref) => isCollectionRef(ref) && isComponentRef(ref);

enum RefsNeeded {
    REF,
    REF_AND_REFS,
}
export function renderRefsType(
    refs: RefsTree,
    refsType: string,
    generateTarget: GenerateTarget = GenerateTarget.jay,
) {
    let renderedRefs: string;
    let imports = Imports.none();

    const componentRefs = new Map<string, RefsNeeded>();

    if (hasRefs(refs, false)) {
        const generateTypeForPath = (refsTree: RefsTree, indent: Indent): string => {
            const renderedRefs = refsTree.refs
                .filter((_) => !_.autoRef)
                .map((ref) => {
                    let referenceType: string;
                    if (isComponentCollectionRef(ref)) {
                        referenceType = `${ref.elementType.name}Refs<${ref.viewStateType.name}>`;
                        componentRefs.set(ref.elementType.name, RefsNeeded.REF_AND_REFS);
                    } else if (isCollectionRef(ref)) {
                        referenceType = `HTMLElementCollectionProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                        imports = imports.plus(Import.HTMLElementCollectionProxy);
                    } else if (isComponentRef(ref)) {
                        referenceType = `${ref.elementType.name}Ref<${ref.viewStateType.name}>`;
                        if (!componentRefs.has(ref.elementType.name))
                            componentRefs.set(ref.elementType.name, RefsNeeded.REF);
                    } else {
                        referenceType = `HTMLElementProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                        imports = imports.plus(Import.HTMLElementProxy);
                    }
                    return `${indent.curr}${ref.ref}: ${referenceType}`;
                })
                .join(',\n');

            const childTypes = Object.entries(refsTree.children)
                .filter(([_, childRefNode]) => {
                    return childRefNode.imported || hasRefs(childRefNode, false);
                })
                .map(([childName, childRefNode]) => {
                    if (childRefNode.imported) {
                        const importedTypeName = childRefNode.repeated
                            ? childRefNode.imported.repeatedRefsTypeName
                            : childRefNode.imported.refsTypeName;
                        return `${indent.curr}${childName}: ${importedTypeName}`;
                    } else if (hasRefs(childRefNode, false)) {
                        const childType = generateTypeForPath(
                            childRefNode,
                            indent.child(true, true),
                        );
                        return `${indent.curr}${childName}: ${childType}`;
                    }
                })
                .join(',\n');

            // Combine refs and child types
            const allTypes = [renderedRefs, childTypes].filter(Boolean).join(',\n');

            return `{
${allTypes}
${indent.lastLine}}`;
        };

        const mainType = generateTypeForPath(refs, new Indent('', true, true));

        const renderedComponentRefs = [...componentRefs].map(([componentName, refsNeeded]) => {
            const elementType =
                generateTarget === GenerateTarget.jay
                    ? `ReturnType<typeof ${componentName}>`
                    : 'any';
            let refTypes = `export type ${componentName}Ref<ParentVS> = MapEventEmitterViewState<ParentVS, ${elementType}>;`;
            imports = imports.plus(Import.MapEventEmitterViewState);
            if (refsNeeded === RefsNeeded.REF_AND_REFS) {
                refTypes += `
export type ${componentName}Refs<ParentVS> =
    ComponentCollectionProxy<ParentVS, ${componentName}Ref<ParentVS>> &
    OnlyEventEmitters<${componentName}Ref<ParentVS>>
`;
                imports = imports
                    .plus(Import.ComponentCollectionProxy)
                    .plus(Import.OnlyEventEmitters);
            }
            return refTypes;
        });

        renderedRefs = `${renderedComponentRefs.join('\n')}
export interface ${refsType} ${mainType}`;
    } else renderedRefs = `export interface ${refsType} {}`;
    return { imports, renderedRefs };
}

export function elementNameToJayType(element: HTMLElement): JayType {
    return htmlElementTagNameMap[element.rawTagName]
        ? new JayHTMLType(htmlElementTagNameMap[element.rawTagName])
        : new JayHTMLType('HTMLElement');
}

export class RefNameGenerator {
    private nextId: number = 1;
    private constNamesToVariables: Map<string, Variables> = new Map();

    newAutoRefNameGenerator() {
        return 'aR' + this.nextId++;
    }

    /**
     * Register a constName as used with the given Variables context.
     * This is used when an imported ref is used to ensure later refs
     * with the same name get a different suffix.
     */
    registerUsedConstName(constName: string, variables: Variables): void {
        if (!this.constNamesToVariables.has(constName)) {
            this.constNamesToVariables.set(constName, variables);
        }
    }

    newConstantName(refName: string, variables: Variables): string {
        let suffix = 2;
        let constName = camelCase(`ref ${refName}`);
        while (this.constNamesToVariables.has(constName)) {
            if (this.constNamesToVariables.get(constName) === variables) {
                return constName;
            }
            constName = camelCase(`ref ${refName}${suffix++}`);
        }
        this.constNamesToVariables.set(constName, variables);
        return constName;
    }
}

function markAutoOnImportedRefs(
    deDuplicated: RefsTree,
    headlessImports: JayHeadlessImports[],
): RefsTree {
    // Only page-level headless imports (with key) are in the page's ref namespace
    const importKeys = headlessImports.filter((_) => _.key).map((_) => _.key!);
    const mappedRefs = deDuplicated.refs.map((ref) => {
        // Only mark as autoRef if the ref is from a headless contract path
        // AND it's not already explicitly non-autoRef (explicitly used in template)
        const isRefOfImportedHeadlessContract = !!importKeys.find((key) =>
            ref.originalName.startsWith(`${key}.`),
        );
        // If already explicitly non-autoRef, don't override it
        if (isRefOfImportedHeadlessContract && ref.autoRef !== false)
            return mkRef(
                ref.ref,
                ref.originalName,
                ref.constName,
                ref.repeated,
                true,
                ref.viewStateType,
                ref.elementType,
            );
        else return ref;
    });
    const mappedChildren = Object.fromEntries(
        Object.entries(deDuplicated.children).map(([key, value]) => [
            key,
            markAutoOnImportedRefs(value, headlessImports),
        ]),
    );
    return mkRefsTree(
        mappedRefs,
        mappedChildren,
        deDuplicated.repeated,
        deDuplicated?.imported?.refsTypeName,
        deDuplicated?.imported?.repeatedRefsTypeName,
    );
}

/**
 * Mark all refs in a RefsTree as autoRef.
 * This is used for refs from headless imports that weren't explicitly used in the template.
 */
function markAllRefsAsAutoRef(refsTree: RefsTree): RefsTree {
    const mappedRefs = refsTree.refs.map((ref) =>
        mkRef(
            ref.ref,
            ref.originalName,
            ref.constName,
            ref.repeated,
            true, // autoRef = true
            ref.viewStateType,
            ref.elementType,
        ),
    );
    const mappedChildren = Object.fromEntries(
        Object.entries(refsTree.children).map(([key, value]) => [key, markAllRefsAsAutoRef(value)]),
    );
    return mkRefsTree(
        mappedRefs,
        mappedChildren,
        refsTree.repeated,
        refsTree?.imported?.refsTypeName,
        refsTree?.imported?.repeatedRefsTypeName,
    );
}

/**
 * Collect all template refs into a map keyed by their originalName.
 * The originalName is the full ref path from the template (e.g., "filters.filter2.categories.isSelected").
 * This is used to find refs that were actually used in the template.
 */
function collectTemplateRefsByOriginalName(tree: RefsTree): Map<string, Ref> {
    const result = new Map<string, Ref>();

    // Add refs at this level
    for (const ref of tree.refs) {
        if (!ref.autoRef) {
            // Only collect non-autoRef refs (actually used in template)
            // Key by originalName which is the full path from the ref attribute
            result.set(ref.originalName, ref);
        }
    }

    // Recurse into children
    for (const childTree of Object.values(tree.children)) {
        const childRefs = collectTemplateRefsByOriginalName(childTree);
        for (const [key, ref] of childRefs) {
            result.set(key, ref);
        }
    }

    return result;
}

/**
 * Update refs in an import tree with constNames from matching template refs.
 * This preserves the import's structure but uses template's constNames for used refs.
 * Matches refs by their full path (e.g., "filters.filter2.categories.isSelected").
 */
function updateImportRefsWithTemplateConstNames(
    importTree: RefsTree,
    templateRefsByOriginalName: Map<string, Ref>,
    path: string[] = [],
): RefsTree {
    // Update refs at this level
    const updatedRefs = importTree.refs.map((ref) => {
        // Construct the full path for this ref (e.g., "filters.filter2.categories.isSelected")
        const fullPath = [...path, ref.ref].join('.');

        // Look up by the full path - this matches the template's ref originalName
        const templateRef = templateRefsByOriginalName.get(fullPath);

        if (templateRef) {
            // Found a matching template ref - use its constName and mark as non-autoRef
            return mkRef(
                ref.ref,
                ref.originalName,
                templateRef.constName,
                ref.repeated,
                false, // Not autoRef since it's used in template
                ref.viewStateType,
                ref.elementType,
            );
        }
        return ref; // Keep as-is (autoRef)
    });

    // Recurse into children
    const updatedChildren = Object.fromEntries(
        Object.entries(importTree.children).map(([childKey, childTree]) => [
            childKey,
            updateImportRefsWithTemplateConstNames(childTree, templateRefsByOriginalName, [
                ...path,
                childKey,
            ]),
        ]),
    );

    return mkRefsTree(
        updatedRefs,
        updatedChildren,
        importTree.repeated,
        importTree?.imported?.refsTypeName,
        importTree?.imported?.repeatedRefsTypeName,
    );
}

export function optimizeRefs(
    { rendered, imports, validations, refs, recursiveRegions }: RenderFragment,
    headlessImports: JayHeadlessImports[] = [],
): RenderFragment {
    const deDuplicateRefsTree = (refs: RefsTree): RefsTree => {
        const mergedRefsMap = refs.refs.reduce((refsMap, ref) => {
            if (refsMap[ref.ref] === ref.ref) {
                const firstRef: Ref = refsMap[ref.ref];
                if (!equalJayTypes(firstRef.viewStateType, ref.viewStateType))
                    validations.push(
                        `invalid usage of refs: the ref [${ref.ref}] is used with two different view types [${firstRef.viewStateType.name}, ${ref.viewStateType.name}]`,
                    );
                else if (firstRef.repeated !== ref.repeated)
                    validations.push(
                        `invalid usage of refs: the ref [${ref.ref}] is used once with forEach and second time without`,
                    );
                else {
                    if (!equalJayTypes(firstRef.elementType, ref.elementType)) {
                        if (firstRef.elementType instanceof JayUnionType) {
                            if (!firstRef.elementType.hasType(ref.elementType))
                                firstRef.elementType = new JayUnionType([
                                    ...firstRef.elementType.ofTypes,
                                    ref.elementType,
                                ]);
                        } else
                            firstRef.elementType = new JayUnionType([
                                firstRef.elementType,
                                ref.elementType,
                            ]);
                    }
                }
            } else refsMap[ref.ref] = ref;
            return refsMap;
        }, {});
        const mergedRefs: Ref[] = Object.values(mergedRefsMap);
        const optimizedChildren = Object.fromEntries(
            Object.entries(refs.children).map(([key, child]) => [key, deDuplicateRefsTree(child)]),
        );

        return mkRefsTree(
            mergedRefs,
            optimizedChildren,
            refs.repeated,
            refs?.imported?.refsTypeName,
            refs?.imported?.repeatedRefsTypeName,
        );
    };

    const deDuplicated = deDuplicateRefsTree(refs);
    const markedAutoOnImported = markAutoOnImportedRefs(deDuplicated, headlessImports);

    // Collect all template refs by their originalName (full path from ref attribute)
    // These are refs that were actually used in the template (non-autoRef)
    const templateRefsByOriginalName = collectTemplateRefsByOriginalName(markedAutoOnImported);

    // For each headless import, use its refs structure but update constNames
    // from matching template refs
    // Only page-level headless imports (with key) are merged into the page's ref tree
    const pageLevelHeadless = headlessImports.filter((_) => _.key);
    const importedRefsUpdated = Object.fromEntries(
        pageLevelHeadless.map((_) => {
            // First mark all import refs as autoRef
            const markedAuto = markAllRefsAsAutoRef(_.refs);
            // Then update constNames for refs that were used in template
            // Start path with the import key (e.g., "filters") to match the template ref paths
            const updated = updateImportRefsWithTemplateConstNames(
                markedAuto,
                templateRefsByOriginalName,
                [_.key!],
            );
            return [_.key!, updated];
        }),
    );

    // Merge: use import's structure (canonical), which now has correct constNames
    // For non-import children from template, keep them as-is
    const mergedChildren: Record<string, RefsTree> = {};

    // First, add all children from template that are NOT headless imports
    const importKeys = new Set(pageLevelHeadless.map((_) => _.key!));
    for (const [key, child] of Object.entries(markedAutoOnImported.children)) {
        if (!importKeys.has(key)) {
            mergedChildren[key] = child;
        }
    }

    // Then add all import refs (which now have updated constNames)
    for (const [key, child] of Object.entries(importedRefsUpdated)) {
        mergedChildren[key] = child;
    }

    const combined = mkRefsTree(
        markedAutoOnImported.refs,
        mergedChildren,
        markedAutoOnImported.repeated,
    );
    return new RenderFragment(rendered, imports, validations, combined, recursiveRegions);
}

export enum ReferenceManagerTarget {
    element,
    elementBridge,
    sandboxRoot,
}

const REFERENCE_MANAGER_TYPES: Record<
    ReferenceManagerTarget,
    { referenceManagerInit: string; imports: Imports }
> = {
    [ReferenceManagerTarget.element]: {
        referenceManagerInit: 'ReferencesManager.for',
        imports: Imports.for(Import.ReferencesManager),
    },
    [ReferenceManagerTarget.elementBridge]: {
        referenceManagerInit: 'SecureReferencesManager.forElement',
        imports: Imports.for(Import.SecureReferencesManager),
    },
    [ReferenceManagerTarget.sandboxRoot]: {
        referenceManagerInit: 'SecureReferencesManager.forSandboxRoot',
        imports: Imports.for(Import.SecureReferencesManager),
    },
};

export function renderReferenceManager(
    refs: RefsTree,
    target: ReferenceManagerTarget,
): { renderedRefsManager: string; refsManagerImport: Imports } {
    const { referenceManagerInit, imports } = REFERENCE_MANAGER_TYPES[target];
    const options = target === ReferenceManagerTarget.element ? 'options, ' : '';

    // Track used ref manager names to avoid duplicates
    const usedRefManagerNames = new Set<string>();

    // Track used ref const names to avoid duplicates across different branches
    const usedRefConstNames = new Set<string>();

    // IMPORTANT: First, collect all constNames from non-autoRef refs.
    // These refs are actually used in the render code, so their constNames
    // MUST be preserved exactly as-is to match the render code.
    const collectReservedConstNames = (refsTree: RefsTree): void => {
        for (const ref of refsTree.refs) {
            if (!ref.autoRef) {
                // This ref is used in render code - reserve its constName
                usedRefConstNames.add(ref.constName);
            }
        }
        for (const child of Object.values(refsTree.children)) {
            collectReservedConstNames(child);
        }
    };
    collectReservedConstNames(refs);

    const getUniqueRefManagerName = (baseName: string): string => {
        const baseCamelCase = camelCase(`${baseName}RefManager`);

        if (!usedRefManagerNames.has(baseCamelCase)) {
            usedRefManagerNames.add(baseCamelCase);
            return baseCamelCase;
        }

        // If name is already used, append a suffix
        let suffix = 2;
        let uniqueName = `${baseCamelCase}${suffix}`;
        while (usedRefManagerNames.has(uniqueName)) {
            suffix++;
            uniqueName = `${baseCamelCase}${suffix}`;
        }
        usedRefManagerNames.add(uniqueName);
        return uniqueName;
    };

    const getUniqueRefConstName = (ref: Ref): string => {
        const constName = ref.constName;

        // Non-autoRef refs are used in render code - must keep their original constName
        if (!ref.autoRef) {
            return constName;
        }

        // AutoRef refs (from unused imports) can be renamed to avoid conflicts
        if (!usedRefConstNames.has(constName)) {
            usedRefConstNames.add(constName);
            return constName;
        }

        // If name is already used, append a suffix
        let suffix = 2;
        let uniqueName = `${constName}${suffix}`;
        while (usedRefConstNames.has(uniqueName)) {
            suffix++;
            uniqueName = `${constName}${suffix}`;
        }
        usedRefConstNames.add(uniqueName);
        return uniqueName;
    };

    const renderRefManagerNode = (name: string, refsTree: RefsTree) => {
        const elemRefs = refsTree.refs.filter((_) => !isComponentRef(_) && !isCollectionRef(_));
        const elemCollectionRefs = refsTree.refs.filter(
            (_) => !isComponentRef(_) && isCollectionRef(_),
        );
        const compRefs = refsTree.refs.filter((_) => isComponentRef(_) && !isCollectionRef(_));
        const compCollectionRefs = refsTree.refs.filter(
            (_) => isComponentRef(_) && isCollectionRef(_),
        );

        const elemRefsDeclarations = elemRefs.map((ref) => `'${ref.ref}'`).join(', ');
        const elemCollectionRefsDeclarations = elemCollectionRefs
            .map((ref) => `'${ref.ref}'`)
            .join(', ');
        const compRefsDeclarations = compRefs.map((ref) => `'${ref.ref}'`).join(', ');
        const compCollectionRefsDeclarations = compCollectionRefs
            .map((ref) => `'${ref.ref}'`)
            .join(', ');
        // Use unique const names to avoid duplicate variable declarations across branches
        const refVariables = [
            ...elemRefs.map((ref) => getUniqueRefConstName(ref)),
            ...elemCollectionRefs.map((ref) => getUniqueRefConstName(ref)),
            ...compRefs.map((ref) => getUniqueRefConstName(ref)),
            ...compCollectionRefs.map((ref) => getUniqueRefConstName(ref)),
        ].join(', ');

        const childRenderedRefManagers: string[] = [];
        const childRefManagerMembers: string[] = [];
        Object.entries(refsTree.children).forEach(([childName, childRefNode]) => {
            const name = getUniqueRefManagerName(childName);
            const rendered = renderRefManagerNode(name, childRefNode);
            childRefManagerMembers.push(`    ${childName}: ${name}`);
            childRenderedRefManagers.push(rendered);
        });

        const childRefManager =
            childRefManagerMembers.length > 0
                ? `, {
  ${childRefManagerMembers.join(',\n')}         
}`
                : '';

        const renderedRefManager = `    const [${name}, [${refVariables}]] =
        ${referenceManagerInit}(${options}[${elemRefsDeclarations}], [${elemCollectionRefsDeclarations}], [${compRefsDeclarations}], [${compCollectionRefsDeclarations}]${childRefManager});`;
        return [...childRenderedRefManagers, renderedRefManager].join('\n');
    };

    if (hasRefs(refs, true)) {
        const renderedRefsManager = renderRefManagerNode('refManager', refs);
        return { renderedRefsManager, refsManagerImport: imports };
    } else {
        const renderedRefsManager = `const [refManager, []] = ${referenceManagerInit}(${options}[], [], [], []);`;
        return { renderedRefsManager, refsManagerImport: imports };
    }
}
