import { JayImportResolver } from '../jay-target/jay-import-resolver';
import { Contract, ContractTag, ContractTagType } from './contract';
import {
    isArrayType,
    JAY_CONTRACT_EXTENSION,
    JayArrayType,
    JayEnumType,
    JayHTMLType,
    JayImportedType,
    JayObjectType,
    JayPromiseType,
    JayType,
    JayUnknown,
    JayValidations,
    Ref,
    mkRefsTree,
    RefsTree,
    WithValidations,
    mkRef,
    isEnumType,
} from '@jay-framework/compiler-shared';
import { camelCase, pascalCase } from 'change-case';
import path from 'path';
import {toInterfaceName} from "../jay-target/jay-html-parser";

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
                isRepeated: isRepeated || subTag.repeated,
                isAsync: subTag.async
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

    const maybeArray = isRepeated ? new JayArrayType(objectType): objectType;
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
            const type = isAsync ?
                new JayPromiseType(maybeArrayType) : maybeArrayType;

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

async function traverseSubContractTag(
    tag: ContractTag,
    context: ContractTraversalContext,
): Promise<WithValidations<SubContractTraverseResult>> {
    if (tag.link) {
        return await traverseLinkedSubContract(tag, context);
    }
    return await traverseTags(tag.tags, toInterfaceName([context.viewStateType.name, tag.tag]), context);
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
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return { type: tag.dataType };
    } else {
        return { type: tag.dataType || JayUnknown };
    }
}

export async function contractToImportsViewStateAndRefs(
    contract: Contract,
    contractFilePath: string,
    jayImportResolver: JayImportResolver,
    isRepeated: boolean = false,
    isAsync: boolean = false,
): Promise<WithValidations<SubContractTraverseResult>> {
    return await traverseTags(contract.tags, pascalCase(contract.name + 'ViewState'), {
        viewStateType: undefined,
        isRepeated,
        contractFilePath,
        importResolver: jayImportResolver,
        isAsync
    });
}
