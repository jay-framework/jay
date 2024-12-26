import {
    equalJayTypes,
    Import,
    Imports,
    JayComponentType,
    JayHTMLType,
    JayType,
    JayTypeAlias,
    JayUnionType,
    Ref,
    RenderFragment,
} from 'jay-compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { htmlElementTagNameMap } from './html-element-tag-name-map';

const isComponentRef = (ref: Ref) =>
    ref.elementType instanceof JayComponentType || ref.elementType instanceof JayTypeAlias;
const isCollectionRef = (ref: Ref) => ref.dynamicRef;
const isComponentCollectionRef = (ref: Ref) => isCollectionRef(ref) && isComponentRef(ref);

export function renderRefsType(refs: Ref[], refsType: string) {
    let renderedRefs;
    let imports = Imports.none();
    let refImportsInUse = new Set<string>();
    let refsToRender = refs.filter((_) => !_.autoRef);
    if (refsToRender.length > 0) {
        const renderedReferences = refsToRender
            .map((ref) => {
                let referenceType;
                if (isComponentCollectionRef(ref)) {
                    referenceType = `${ref.elementType.name}Refs<${ref.viewStateType.name}>`;
                    refImportsInUse.add(`${ref.elementType.name}Refs`);
                } else if (isCollectionRef(ref)) {
                    referenceType = `HTMLElementCollectionProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                    imports = imports.plus(Import.HTMLElementCollectionProxy);
                } else if (isComponentRef(ref)) {
                    referenceType = `${ref.elementType.name}ComponentType<${ref.viewStateType.name}>`;
                    refImportsInUse.add(`${ref.elementType.name}ComponentType`);
                } else {
                    referenceType = `HTMLElementProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                    imports = imports.plus(Import.HTMLElementProxy);
                }
                return `  ${ref.ref}: ${referenceType}`;
            })
            .join(',\n');
        renderedRefs = `export interface ${refsType} {
${renderedReferences}
}`;
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

export function renderRefsForReferenceManager(refs: Ref[]) {
    const elemRefs = refs.filter((_) => !isComponentRef(_) && !isCollectionRef(_));
    const elemCollectionRefs = refs.filter((_) => !isComponentRef(_) && isCollectionRef(_));
    const compRefs = refs.filter((_) => isComponentRef(_) && !isCollectionRef(_));
    const compCollectionRefs = refs.filter((_) => isComponentRef(_) && isCollectionRef(_));

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
    return {
        elemRefsDeclarations,
        elemCollectionRefsDeclarations,
        compRefsDeclarations,
        compCollectionRefsDeclarations,
        refVariables,
    };
}
