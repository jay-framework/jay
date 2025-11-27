import { JayImportResolver } from '../jay-target/jay-import-resolver';
import { Contract, ContractTag, ContractTagType, RenderingPhase } from './contract';
import {
    isArrayType,
    JAY_CONTRACT_EXTENSION,
    JayArrayType,
    JayEnumType,
    JayHTMLType,
    JayImportedType,
    JayObjectType,
    JayPromiseType,
    JayRecursiveType,
    JayType,
    JayUnknown,
    JayValidations,
    Ref,
    mkRefsTree,
    RefsTree,
    WithValidations,
    mkRef,
    isEnumType,
    isRecursiveType,
    isObjectType,
    isPromiseType,
} from '@jay-framework/compiler-shared';
import { camelCase, pascalCase } from 'change-case';
import path from 'path';
import { toInterfaceName } from '../jay-target/jay-html-parser';
import { createPhaseContract } from './contract-phase-validator';

export interface JayContractImportLink {
    module: string;
    viewState: string;
    refs: string;
    repeatedRefs: string;
}

export interface EnumToImport {
    declaringModule: string;
    type: JayEnumType;
}

interface SubContractTraverseResult {
    type?: JayType;
    refs: RefsTree;
    importLinks: JayContractImportLink[];
    enumsToImport: EnumToImport[];
}

interface TagTraverseResult {
    type?: JayType;
    ref?: Ref;
}

interface ContractTraversalContext {
    viewStateType: JayType;
    isRepeated: boolean;
    isAsync: boolean;
    contractFilePath: string;
    importResolver: JayImportResolver;
}

async function traverseTags(
    tags: ContractTag[],
    typeName: string,
    context: ContractTraversalContext,
) {
    const { isRepeated, isAsync } = context;
    const objectTypeMembers: Record<string, JayType> = {};
    let importLinks: JayContractImportLink[] = [];
    const refs: Ref[] = [];
    const childRefs: Record<string, RefsTree> = {};
    const objectType = new JayObjectType(typeName, objectTypeMembers);
    const enumsToImport: EnumToImport[] = [];
    let validations: JayValidations = [];

    for (const subTag of tags) {
        if (subTag.type.includes(ContractTagType.subContract)) {
            const subContractTypes = await traverseSubContractTag(subTag, {
                ...context,
                viewStateType: objectType,
                // For ViewState: only use the tag's own repeated flag (don't inherit from parent)
                isRepeated: subTag.repeated || false,
                isAsync: subTag.async,
            });
            if (subContractTypes.val) {
                const result: SubContractTraverseResult = subContractTypes.val;
                importLinks = [...importLinks, ...result.importLinks];
                childRefs[subTag.tag] = result.refs;
                result.type && (objectTypeMembers[camelCase(subTag.tag)] = result.type);
                enumsToImport.push(...subContractTypes.val.enumsToImport);
            }
            validations = [...validations, ...subContractTypes.validations];
        } else {
            const result = await traverseTag(subTag, {
                ...context,
                viewStateType: objectType,
                // For Refs: inherit repeated from parent (child refs in repeated parent should be collections)
                isRepeated: isRepeated || subTag.repeated,
            });
            if (result.type && isEnumType(result.type))
                enumsToImport.push({
                    type: result.type,
                    declaringModule: context.contractFilePath,
                });
            result.ref && refs.push(result.ref);
            result.type && (objectTypeMembers[camelCase(subTag.tag)] = result.type);
        }
    }

    const maybeArray = isRepeated ? new JayArrayType(objectType) : objectType;
    const type = isAsync ? new JayPromiseType(maybeArray) : maybeArray;

    return new WithValidations<SubContractTraverseResult>(
        { type, refs: mkRefsTree(refs, childRefs, context.isRepeated), importLinks, enumsToImport },
        validations,
    );
}

async function traverseLinkedSubContract(tag: ContractTag, context: ContractTraversalContext) {
    const { importResolver, isRepeated, isAsync } = context;
    const linkWithExtension = tag.link.endsWith(JAY_CONTRACT_EXTENSION)
        ? tag.link
        : tag.link + JAY_CONTRACT_EXTENSION;
    const subContractPath = importResolver.resolveLink(
        path.dirname(context.contractFilePath),
        linkWithExtension,
    );
    const subContractFile = tag.link.replace(JAY_CONTRACT_EXTENSION, '');

    const subContract = importResolver.loadContract(subContractPath);
    if (subContract.val) {
        const contractName = subContract.val.name;
        const viewState = `${pascalCase(contractName)}ViewState`;
        const refsTypeName = `${pascalCase(contractName)}Refs`;
        const repeatedRefsTypeName = `${pascalCase(contractName)}RepeatedRefs`;

        const subContractTypes = await contractToImportsViewStateAndRefs(
            subContract.val,
            subContractPath,
            importResolver,
            isRepeated,
        );
        if (subContractTypes.val) {
            const {
                type: subContractType,
                refs: subContractRefsTree,
                enumsToImport,
            } = subContractTypes.val;

            const maybeArrayType = isArrayType(subContractType)
                ? new JayArrayType(new JayImportedType(viewState, subContractType.itemType))
                : new JayImportedType(viewState, subContractType);
            const type = isAsync ? new JayPromiseType(maybeArrayType) : maybeArrayType;

            const importLinks: JayContractImportLink[] = [
                {
                    module: subContractFile,
                    viewState,
                    refs: refsTypeName,
                    repeatedRefs: repeatedRefsTypeName,
                },
            ];

            const refs = mkRefsTree(
                subContractRefsTree.refs,
                subContractRefsTree.children,
                subContractRefsTree.repeated,
                refsTypeName,
                repeatedRefsTypeName,
            );

            return new WithValidations<SubContractTraverseResult>({
                type,
                refs,
                importLinks,
                enumsToImport,
            });
        } else return new WithValidations(undefined, subContractTypes.validations);
    } else {
        return new WithValidations(undefined, subContract.validations);
    }
}

function isRecursiveLink(link: string): boolean {
    return link.startsWith('$/');
}

function traverseRecursiveSubContract(
    tag: ContractTag,
    context: ContractTraversalContext,
): WithValidations<SubContractTraverseResult> {
    const { isRepeated, isAsync } = context;

    // Create a recursive type with the reference path
    const referencePath = tag.link;
    const recursiveType = new JayRecursiveType(referencePath);

    // Wrap in array if repeated
    const maybeArrayType = isRepeated ? new JayArrayType(recursiveType) : recursiveType;

    // Wrap in promise if async
    const type = isAsync ? new JayPromiseType(maybeArrayType) : maybeArrayType;

    // Return result with empty refs (recursive types don't have their own refs)
    return new WithValidations<SubContractTraverseResult>({
        type,
        refs: mkRefsTree([], {}, isRepeated),
        importLinks: [],
        enumsToImport: [],
    });
}

async function traverseSubContractTag(
    tag: ContractTag,
    context: ContractTraversalContext,
): Promise<WithValidations<SubContractTraverseResult>> {
    if (tag.link) {
        // Check if it's a recursive reference
        if (isRecursiveLink(tag.link)) {
            return traverseRecursiveSubContract(tag, context);
        }
        return await traverseLinkedSubContract(tag, context);
    }
    return await traverseTags(
        tag.tags,
        toInterfaceName([context.viewStateType.name, tag.tag]),
        context,
    );
}

async function traverseTag(
    tag: ContractTag,
    context: ContractTraversalContext,
): Promise<TagTraverseResult> {
    const { viewStateType, isRepeated } = context;
    if (tag.type.includes(ContractTagType.interactive)) {
        const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
        let refName = camelCase(tag.tag);
        let constName = camelCase(`ref ${refName}`);
        const ref = mkRef(
            refName,
            tag.tag,
            constName,
            isRepeated,
            false,
            viewStateType,
            new JayHTMLType(elementType),
        );
        return { ref, ...(tag.dataType ? { type: tag.dataType } : {}) };
    } else if (tag.type.includes(ContractTagType.variant) && isEnumType(tag.dataType)) {
        return { type: tag.dataType };
    } else {
        return { type: tag.dataType || JayUnknown };
    }
}

function resolveRecursiveReferences(type: JayType | undefined, rootType: JayType): void {
    if (!type) return;

    if (isRecursiveType(type)) {
        if (type.referencePath === '$/') {
            // Reference to root type
            type.resolvedType = rootType;
        } else if (type.referencePath.startsWith('$/')) {
            // Check if the path ends with [] (array item unwrapping syntax)
            const hasArrayUnwrap = type.referencePath.endsWith('[]');
            const pathToResolve = hasArrayUnwrap
                ? type.referencePath.substring(0, type.referencePath.length - 2)
                : type.referencePath;

            // Reference to nested type
            const path = pathToResolve.substring(2); // Remove '$/'
            const pathParts = path.split('/');
            let currentType: JayType = rootType;

            // Navigate through the path
            for (const part of pathParts) {
                if (isObjectType(currentType)) {
                    const camelCasePart = camelCase(part);
                    currentType = currentType.props[camelCasePart];
                    if (!currentType) {
                        // Invalid path - will be caught during compilation
                        break;
                    }
                } else {
                    break;
                }
            }

            // If [] syntax is used, unwrap the array
            if (hasArrayUnwrap && isArrayType(currentType)) {
                currentType = currentType.itemType;
            }

            type.resolvedType = currentType || rootType;
        }
    } else if (isArrayType(type)) {
        resolveRecursiveReferences(type.itemType, rootType);
    } else if (isObjectType(type) && type.props) {
        for (const memberType of Object.values(type.props)) {
            resolveRecursiveReferences(memberType, rootType);
        }
    } else if (isPromiseType(type)) {
        resolveRecursiveReferences(type.itemType, rootType);
    }
}

function getRootObjectType(type: JayType | undefined): JayType | undefined {
    if (!type) return undefined;
    if (isArrayType(type)) {
        return getRootObjectType(type.itemType);
    }
    if (isPromiseType(type)) {
        return getRootObjectType(type.itemType);
    }
    return type;
}

export async function contractToImportsViewStateAndRefs(
    contract: Contract,
    contractFilePath: string,
    jayImportResolver: JayImportResolver,
    isRepeated: boolean = false,
    isAsync: boolean = false,
): Promise<WithValidations<SubContractTraverseResult>> {
    const result = await traverseTags(contract.tags, pascalCase(contract.name + 'ViewState'), {
        viewStateType: undefined,
        isRepeated,
        contractFilePath,
        importResolver: jayImportResolver,
        isAsync,
    });

    // Resolve recursive references
    return result.map((r) => {
        if (r.type) {
            // Find the root object type (unwrap arrays and promises)
            const rootType = getRootObjectType(r.type);
            if (rootType) {
                resolveRecursiveReferences(r.type, rootType);
            }
        }
        return r;
    });
}

/**
 * Generate phase-specific ViewState type
 */
export async function contractToPhaseViewState(
    contract: Contract,
    contractFilePath: string,
    jayImportResolver: JayImportResolver,
    phase: RenderingPhase,
    isRepeated: boolean = false,
    isAsync: boolean = false,
): Promise<WithValidations<SubContractTraverseResult>> {
    // Filter contract to only include tags for this phase
    const phaseContract = createPhaseContract(contract, phase);

    // Generate ViewState type name based on phase
    const phaseName = phase === 'fast+interactive' ? 'Interactive' : pascalCase(phase);
    const viewStateName = pascalCase(`${contract.name} ${phaseName} ViewState`);

    const result = await traverseTags(phaseContract.tags, viewStateName, {
        viewStateType: undefined,
        isRepeated,
        contractFilePath,
        importResolver: jayImportResolver,
        isAsync,
    });

    // Resolve recursive references
    return result.map((r) => {
        if (r.type) {
            // Find the root object type (unwrap arrays and promises)
            const rootType = getRootObjectType(r.type);
            if (rootType) {
                resolveRecursiveReferences(r.type, rootType);
            }
        }
        return r;
    });
}

export interface PhaseViewStates {
    slow: SubContractTraverseResult;
    fast: SubContractTraverseResult;
    interactive: SubContractTraverseResult;
}

/**
 * Generate all three phase-specific ViewState types
 */
export async function contractToAllPhaseViewStates(
    contract: Contract,
    contractFilePath: string,
    jayImportResolver: JayImportResolver,
): Promise<WithValidations<PhaseViewStates>> {
    const [slowResult, fastResult, interactiveResult] = await Promise.all([
        contractToPhaseViewState(contract, contractFilePath, jayImportResolver, 'slow'),
        contractToPhaseViewState(contract, contractFilePath, jayImportResolver, 'fast'),
        contractToPhaseViewState(contract, contractFilePath, jayImportResolver, 'fast+interactive'),
    ]);

    const validations = [
        ...slowResult.validations,
        ...fastResult.validations,
        ...interactiveResult.validations,
    ];

    if (validations.length > 0 || !slowResult.val || !fastResult.val || !interactiveResult.val) {
        return new WithValidations(undefined, validations);
    }

    return new WithValidations<PhaseViewStates>(
        {
            slow: slowResult.val,
            fast: fastResult.val,
            interactive: interactiveResult.val,
        },
        validations,
    );
}
