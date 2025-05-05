import {JayImportResolver} from "../jay-target/jay-import-resolver";
import {Contract, ContractTag, ContractTagType} from "./contract";
import {
    JAY_CONTRACT_EXTENSION,
    JayArrayType,
    JayEnumType,
    JayHTMLType,
    JayImportedContract,
    JayObjectType,
    JayType,
    JayUnknown,
    Ref
} from "jay-compiler-shared";
import {camelCase, pascalCase} from "change-case";

export interface JayContractImportLink {
    module: string;
    viewState: string;
    refs: string;
    repeatedRefs: string;
}

interface TraverseResult {
    type?: JayType;
    refs: Ref[];
    importLinks: JayContractImportLink[];
}

interface ContractTraversalContext {
    tag: ContractTag;
    viewStateType: JayType;
    isRepeated: boolean;
    path: string[];
    contractFilePath: string;
}

async function traverseContractTag(
    context: ContractTraversalContext,
    importResolver: JayImportResolver,
): Promise<TraverseResult> {
    const {tag, viewStateType, isRepeated, path} = context;
    if (tag.type.includes(ContractTagType.subContract)) {
        if (tag.link) {
            const linkWithExtension = tag.link.endsWith(JAY_CONTRACT_EXTENSION)
                ? tag.link
                : tag.link + JAY_CONTRACT_EXTENSION;
            const subContractPath = importResolver.resolveLink(
                context.contractFilePath,
                linkWithExtension,
            );
            const subContract = importResolver.loadContract(subContractPath);
            const subContractFile = tag.link.replace(JAY_CONTRACT_EXTENSION, '');
            // todo handle invalid contract
            const contractName = subContract.val.name;
            const viewState = `${pascalCase(contractName)}ViewState`;
            const refs = `${pascalCase(contractName)}Refs`;
            const repeatedRefs = `${pascalCase(contractName)}RepeatedRefs`;

            const contractType = new JayImportedContract(contractName, viewState, refs, repeatedRefs);
            const type = tag.repeated ? new JayArrayType(contractType) : contractType;

            const importLinks: JayContractImportLink[] = [
                {
                    module: subContractFile,
                    viewState,
                    refs,
                    repeatedRefs,
                },
            ];

            return {
                type,
                refs: [
                    {
                        ref: tag.tag,
                        path,
                        constName: '',
                        dynamicRef: isRepeated || tag.repeated,
                        autoRef: false,
                        viewStateType,
                        elementType: contractType,
                    },
                ],
                importLinks,
            };
        }

        const props: Record<string, JayType> = {};
        let importLinks: JayContractImportLink[] = [];
        let refs: Ref[] = [];
        const subInterfaceName = tag.tag.charAt(0).toUpperCase() + tag.tag.slice(1);
        const subViewStateType = {name: subInterfaceName, kind: 0};

        for (const subTag of tag.tags) {
            const result: TraverseResult = await traverseContractTag(
                {
                    tag: subTag,
                    viewStateType: subViewStateType,
                    isRepeated: isRepeated || tag.repeated,
                    path: [...path, tag.tag],
                    contractFilePath: context.contractFilePath,
                },
                importResolver,
            );
            importLinks = [...importLinks, ...result.importLinks];
            refs = [...refs, ...result.refs];
            result.type && (props[camelCase(subTag.tag)] = result.type);
        }

        const objectType = new JayObjectType(pascalCase(tag.tag), props);
        const type = tag.repeated ? new JayArrayType(objectType) : objectType;

        return {type, refs, importLinks};
    } else if (tag.type.includes(ContractTagType.interactive)) {
        const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
        const ref: Ref = {
            ref: tag.tag,
            path,
            constName: '',
            dynamicRef: isRepeated,
            autoRef: false,
            viewStateType,
            elementType: new JayHTMLType(elementType),
        };
        return {refs: [ref], importLinks: [], ...(tag.dataType ? {type: tag.dataType} : {})};
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return {type: tag.dataType, refs: [], importLinks: []};
    } else {
        return {type: tag.dataType || JayUnknown, refs: [], importLinks: []};
    }
}

export async function contractToImportsViewStateAndRefs(contract: Contract,
                                                        contractFilePath: string,
                                                        jayImportResolver: JayImportResolver): Promise<TraverseResult> {
    const contractTypeMembers: Record<string, JayType> = {};
    let importLinks: JayContractImportLink[] = [];
    let refs: Ref[] = [];
    const viewStateType = {name: pascalCase(contract.name) + 'ViewState', kind: 0};

    for (const tag of contract.tags) {
        const result = await traverseContractTag(
            {
                tag,
                viewStateType,
                isRepeated: false,
                path: [],
                contractFilePath,
            },
            jayImportResolver,
        );
        importLinks = [...importLinks, ...result.importLinks];
        refs = [...refs, ...result.refs];
        result.type && (contractTypeMembers[camelCase(tag.tag)] = result.type);
    }

    const type = new JayObjectType(`${pascalCase(contract.name)}ViewState`, contractTypeMembers);
    return {importLinks, refs, type};
}