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
    Ref, RefsTree,
    RenderFragment,
} from 'jay-compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { htmlElementTagNameMap } from './html-element-tag-name-map';
import { camelCase } from 'camel-case';
import { Indent } from './indent';

const isComponentRef = (ref: Ref) =>
    ref.elementType instanceof JayComponentType || ref.elementType instanceof JayTypeAlias;
const isCollectionRef = (ref: Ref) => ref.dynamicRef;
const isComponentCollectionRef = (ref: Ref) => isCollectionRef(ref) && isComponentRef(ref);

function hasRefs(refs: RefsTree) {
    return refs.refs.length > 0 ||
        Object.entries(refs.children).map(([ref, refs]) => hasRefs(refs))
            .reduce((prev, curr) => prev || curr, false);
}

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
    const refImportsInUse = new Set<string>();

    const componentRefs = new Map<string, RefsNeeded>();

    if (hasRefs(refs)) {
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
                .map(([childName, childRefNode]) => {
                    if (childRefNode.imported) {
                        const importedTypeName = childRefNode.repeated?
                            childRefNode.imported.repeatedRefsTypeName :
                            childRefNode.imported.refsTypeName;
                        return `${indent.curr}${childName}: ${importedTypeName}`
                    }
                    else {
                        const childType = generateTypeForPath(childRefNode, indent.child(true, true));
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
    return { imports, renderedRefs, refImportsInUse };
}

export function elementNameToJayType(element: HTMLElement): JayType {
    return htmlElementTagNameMap[element.rawTagName]
        ? new JayHTMLType(htmlElementTagNameMap[element.rawTagName])
        : new JayHTMLType('HTMLElement');
}

export function newAutoRefNameGenerator() {
    let nextId = 1;
    return function (): string {
        return 'aR' + nextId++;
    };
}

export function optimizeRefs({
    rendered,
    imports,
    validations,
    refs,
}: RenderFragment): RenderFragment {
    const mergedRefsMap = refs.reduce((refsMap, ref) => {
        if (refsMap[ref.ref] === ref.ref) {
            const firstRef: Ref = refsMap[ref.ref];
            if (!equalJayTypes(firstRef.viewStateType, ref.viewStateType))
                validations.push(
                    `invalid usage of refs: the ref [${ref.ref}] is used with two different view types [${firstRef.viewStateType.name}, ${ref.viewStateType.name}]`,
                );
            else if (firstRef.dynamicRef !== ref.dynamicRef)
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
    return new RenderFragment(rendered, imports, validations, mergedRefs);
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
        const refVariables = [
            ...elemRefs.map((ref) => ref.constName),
            ...elemCollectionRefs.map((ref) => ref.constName),
            ...compRefs.map((ref) => ref.constName),
            ...compCollectionRefs.map((ref) => ref.constName),
        ].join(', ');

        const childRenderedRefManagers: string[] = [];
        const childRefManagerMambers: string[] = [];
        Object.entries(refsTree.children).forEach(([childName, childRefNode]) => {
            const name = camelCase(`${childName}RefManager`);
            const rendered = renderRefManagerNode(name, childRefNode);
            childRefManagerMambers.push(`    ${childName}: ${name}`);
            childRenderedRefManagers.push(rendered);
        });

        const childRefManager =
            childRefManagerMambers.length > 0
                ? `, {
  ${childRefManagerMambers.join(',\n')}         
}`
                : '';

        const options = target === ReferenceManagerTarget.element ? 'options, ' : '';
        const renderedRefManager = `    const [${name}, [${refVariables}]] =
        ${referenceManagerInit}(${options}[${elemRefsDeclarations}], [${elemCollectionRefsDeclarations}], [${compRefsDeclarations}], [${compCollectionRefsDeclarations}]${childRefManager});`;
        return [...childRenderedRefManagers, renderedRefManager].join('\n');
    };

    const renderedRefsManager = renderRefManagerNode('refManager', refs);

    return { renderedRefsManager, refsManagerImport: imports };
}
