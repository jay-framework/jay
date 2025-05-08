import {JayImportResolver} from "../jay-target/jay-import-resolver";
import {Contract, ContractTag, ContractTagType} from "./contract";
import {
    JAY_CONTRACT_EXTENSION,
    JayArrayType,
    JayEnumType,
    JayHTMLType,
    JayImportedType,
    JayObjectType,
    JayType,
    JayUnknown, JayValidations,
    Ref, refsTree, RefsTree, WithValidations
} from "jay-compiler-shared";
import {camelCase, pascalCase} from "change-case";
import path from "path";

export interface JayContractImportLink {
    module: string;
    viewState: string;
    refs: string;
    repeatedRefs: string;
}

interface SubContractTraverseResult {
    type?: JayType;
    refs: RefsTree;
    importLinks: JayContractImportLink[];
}


interface TagTraverseResult {
    type?: JayType;
    ref?: Ref;
}

interface ContractTraversalContext {
    viewStateType: JayType;
    isRepeated: boolean;
    contractNesting: string[];
    contractFilePath: string;
    importResolver: JayImportResolver
}

async function traverseTags(tags: ContractTag[], typeName: string, context: ContractTraversalContext) {
    const {isRepeated, contractNesting} = context;
    const objectTypeMembers: Record<string, JayType> = {};
    let importLinks: JayContractImportLink[] = [];
    const refs: Ref[] = [];
    const childRefs: Record<string, RefsTree> = {};
    const objectType = new JayObjectType(typeName, objectTypeMembers);
    let validations: JayValidations = [];

    for (const subTag of tags) {
        if (subTag.type.includes(ContractTagType.subContract)) {
            const subContractTypes = await traverseSubContractTag(subTag,
                {
                    ...context,
                    viewStateType: objectType,
                    isRepeated: isRepeated || subTag.repeated,
                    contractNesting: [...contractNesting, subTag.tag],
                }
            );
            if (subContractTypes.val) {
                const result: SubContractTraverseResult = subContractTypes.val;
                importLinks = [...importLinks, ...result.importLinks];
                childRefs[subTag.tag] = result.refs;
                result.type && (objectTypeMembers[camelCase(subTag.tag)] = result.type);
            }
            validations = [...validations, ...subContractTypes.validations]
        } else {
            const result = await traverseTag(subTag,
                {
                    ...context,
                    viewStateType: objectType,
                    isRepeated: isRepeated || subTag.repeated,
                }
            );
            result.ref && refs.push(result.ref);
            result.type && (objectTypeMembers[camelCase(subTag.tag)] = result.type);
        }
    }

    const type = isRepeated ? new JayArrayType(objectType) : objectType;

    return new WithValidations<SubContractTraverseResult>(
        {type, refs: refsTree(refs, childRefs), importLinks}, validations);
}

async function traverseLinkedSubContract(tag: ContractTag, context: ContractTraversalContext) {
    const {importResolver} = context;
    const linkWithExtension = tag.link.endsWith(JAY_CONTRACT_EXTENSION)
        ? tag.link
        : tag.link + JAY_CONTRACT_EXTENSION;
    const subContractPath = importResolver.resolveLink(
        context.contractFilePath,
        linkWithExtension,
    );
    const subContractFile = tag.link.replace(JAY_CONTRACT_EXTENSION, '');

    const subContract = importResolver.loadContract(subContractPath);
    if (subContract.val) {
        const contractName = subContract.val.name;
        const viewState = `${pascalCase(contractName)}ViewState`;
        const refsTypeName = `${pascalCase(contractName)}Refs`;
        const repeatedRefsTypeName = `${pascalCase(contractName)}RepeatedRefs`;

        const subContractTypes = await contractToImportsViewStateAndRefs(subContract.val, path.dirname(subContractPath), importResolver)
        if (subContractTypes.val) {
            const {
                type: subContractType,
                refs: subContractRefsTree,
                importLinks: subContractImportLinks
            } = subContractTypes.val;

            const type = tag.repeated ?
                new JayImportedType(viewState, new JayArrayType(subContractType)) :
                new JayImportedType(viewState, subContractType);

            const importLinks: JayContractImportLink[] = [
                {
                    module: subContractFile,
                    viewState,
                    refs: refsTypeName,
                    repeatedRefs: repeatedRefsTypeName,
                },
            ];

            const refs = refsTree(subContractRefsTree.refs, subContractRefsTree.children, refsTypeName, repeatedRefsTypeName);

            return new WithValidations<SubContractTraverseResult>({
                type,
                refs,
                importLinks
            });
        } else
            return new WithValidations(undefined, subContractTypes.validations)

    } else {
        return new WithValidations(undefined, subContract.validations)
    }
}

async function traverseSubContractTag(
    tag: ContractTag,
    context: ContractTraversalContext,
): Promise<WithValidations<SubContractTraverseResult>> {
    const {isRepeated, contractNesting} = context;
    if (tag.link) {
        return await traverseLinkedSubContract(tag, context);
    }
    return await traverseTags(tag.tags, pascalCase(tag.tag), context);
}

async function traverseTag(
    tag: ContractTag,
    context: ContractTraversalContext,
): Promise<TagTraverseResult> {
    const {viewStateType, isRepeated, contractNesting} = context;
    if (tag.type.includes(ContractTagType.interactive)) {
        const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
        const ref: Ref = {
            kind: "ref",
            ref: tag.tag,
            path: contractNesting,
            constName: '',
            dynamicRef: isRepeated,
            autoRef: false,
            viewStateType,
            elementType: new JayHTMLType(elementType),
        };
        return {ref, ...(tag.dataType ? {type: tag.dataType} : {})};
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return {type: tag.dataType};
    } else {
        return {type: tag.dataType || JayUnknown};
    }
}

export async function contractToImportsViewStateAndRefs(contract: Contract,
                                                        contractFilePath: string,
                                                        jayImportResolver: JayImportResolver): Promise<WithValidations<SubContractTraverseResult>> {
    return await traverseTags(contract.tags, pascalCase(contract.name + 'ViewState'),{
        viewStateType: undefined,
        isRepeated: false,
        contractNesting: [],
        contractFilePath,
        importResolver: jayImportResolver,
    })
}