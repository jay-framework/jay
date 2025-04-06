import {
    JayArrayType,
    JayObjectType,
    WithValidations,
    Imports,
    JayType,
    Ref,
    JayEnumType,
    ImportsFor,
    JayUnknown,
    JayImportedContract,
    JayHTMLType,
    JAY_CONTRACT_EXTENSION,
    Import,
} from 'jay-compiler-shared';
import { Contract, ContractTag, ContractTagType } from './contract';
import { renderRefsType } from 'jay-compiler-jay-html';
import { generateTypes } from 'jay-compiler-jay-html';
import { camelCase, pascalCase } from 'change-case';
import { LinkedContractResolver } from './contract-parser';

interface JayContractImportLink {
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

function traverseContractTag(
    tag: ContractTag,
    viewStateType: JayType,
    linkedContractResolver: LinkedContractResolver,
    isRepeated: boolean = false,
): TraverseResult {
    if (tag.type.includes(ContractTagType.subContract)) {
        if (tag.link) {
            const subContract = linkedContractResolver.loadContract(tag.link);
            const subContractFile = tag.link.replace(JAY_CONTRACT_EXTENSION, '');
            const contractName = subContract.name;
            const viewState = `${pascalCase(contractName)}ViewState`;
            const refs = `${pascalCase(contractName)}Refs`;
            const repeatedRefs = `${pascalCase(contractName)}RepeatedRefs`;

            let contractType = new JayImportedContract(contractName, viewState, refs, repeatedRefs);
            const type = tag.repeated ? new JayArrayType(contractType) : contractType;

            const importLinks = [
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
        const subViewStateType = { name: subInterfaceName, kind: 0 };

        tag.tags
            // .filter(_ => dataVariantOrSubContract(_))
            .forEach((subTag) => {
                const result: TraverseResult = traverseContractTag(
                    subTag,
                    subViewStateType,
                    linkedContractResolver,
                    isRepeated || tag.repeated,
                );
                importLinks = [...importLinks, ...result.importLinks];
                refs = [...refs, ...result.refs];
                result.type && (props[camelCase(subTag.tag)] = result.type);
            });

        const objectType = new JayObjectType(pascalCase(tag.tag), props);
        const type = tag.repeated ? new JayArrayType(objectType) : objectType;

        return { type, refs, importLinks };
    } else if (tag.type.includes(ContractTagType.interactive)) {
        const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
        const ref: Ref = {
            ref: tag.tag,
            constName: '',
            dynamicRef: isRepeated,
            autoRef: false,
            viewStateType,
            elementType: new JayHTMLType(elementType),
        };
        return { refs: [ref], importLinks: [], ...(tag.dataType ? { type: tag.dataType } : {}) };
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return { type: tag.dataType, refs: [], importLinks: [] };
    } else {
        return { type: tag.dataType || JayUnknown, refs: [], importLinks: [] };
    }
}

function generateRefsInterface(
    contract: Contract,
    allRefs: Ref[],
): {
    imports: Imports;
    renderedRefs: string;
} {
    const refsType = pascalCase(contract.name) + 'Refs';
    const repeatedRefsType = pascalCase(contract.name) + 'RepeatedRefs';

    // Generate regular refs interface
    const { imports, renderedRefs: regularRefs } = renderRefsType(allRefs, refsType);

    // Generate repeated refs interface by replacing HTMLElementProxy with HTMLElementCollectionProxy
    const repeatedRefs = allRefs.map((ref) => ({
        ...ref,
        dynamicRef: true,
    }));
    const { imports: imports2, renderedRefs: repeatedRefsRendered } = renderRefsType(
        repeatedRefs,
        repeatedRefsType,
    );

    // Combine both interfaces
    const renderedRefs = `${regularRefs}\n\n${repeatedRefsRendered}`;

    return { imports: imports.plus(imports2), renderedRefs };
}

function renderImports(imports: Imports, importedLinks: JayContractImportLink[]) {
    const renderedImports = imports.render(ImportsFor.definition);

    const renderedImportedLinks = [];
    for (const { module, refs, repeatedRefs, viewState } of importedLinks) {
        let symbols = `${viewState}, ${refs}, ${repeatedRefs}`;
        renderedImportedLinks.push(`import {${symbols}} from "${module}";`);
    }

    return renderedImports + '\n' + renderedImportedLinks.join('\n');
}

export function compileContract(
    contractWithValidations: WithValidations<Contract>,
    linkedContractResolver: LinkedContractResolver,
): WithValidations<string> {
    return contractWithValidations.map((contract) => {
        const props: Record<string, JayType> = {};
        let importedLinks: JayContractImportLink[] = [];
        let allRefs: Ref[] = [];
        const viewStateType = { name: pascalCase(contract.name) + 'ViewState', kind: 0 };

        contract.tags
            // .filter(_ => dataVariantOrSubContract(_))
            .forEach((tag) => {
                const result = traverseContractTag(tag, viewStateType, linkedContractResolver);
                importedLinks = [...importedLinks, ...result.importLinks];
                allRefs = [...allRefs, ...result.refs];
                result.type && (props[camelCase(tag.tag)] = result.type);
            });

        const rootType = new JayObjectType(`${pascalCase(contract.name)}ViewState`, props);
        let { imports, renderedRefs } = generateRefsInterface(contract, allRefs);
        const types = generateTypes(rootType);
        imports = imports
            .plus(Import.jayElement)
            .plus(Import.RenderElement)
            .plus(Import.RenderElementOptions);
        const renderedImports = renderImports(imports, importedLinks);

        const elementType = `export type ${pascalCase(contract.name)}Element = JayElement<${pascalCase(contract.name)}ViewState, ${pascalCase(contract.name)}Refs>`;
        const elementRenderType = `export type ${pascalCase(contract.name)}ElementRender = RenderElement<${pascalCase(contract.name)}ViewState, ${pascalCase(contract.name)}Refs, ${pascalCase(contract.name)}Element>`;
        const elementPreRenderType = `export type ${pascalCase(contract.name)}ElementPreRender = [${pascalCase(contract.name)}Refs, ${pascalCase(contract.name)}ElementRender]`;
        const renderFunction = `export declare function render(options?: RenderElementOptions): ${pascalCase(contract.name)}ElementPreRender`;

        return `${renderedImports}\n\n${types}\n\n${renderedRefs}\n\n${elementType}\n${elementRenderType}\n${elementPreRenderType}\n\n${renderFunction}`;
    });
}
