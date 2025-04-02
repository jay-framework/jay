import {
    JayArrayType,
    JayObjectType,
    WithValidations,
    Import,
    Imports,
    JayType,
    Ref,
    JayEnumType,
    ImportsFor,
    JayImportedType,
    JayUnknown, JayImportLink, JayUnionType, getModeFileExtension, JayImportName, JayImportedContract
} from 'jay-compiler-shared';
import { HTMLElementProxy, HTMLElementCollectionProxy } from 'jay-runtime';
import { Contract, ContractTag, ContractTagType } from './contract';
import { renderRefsType } from '../../compiler-jay-html/lib/jay-target/jay-html-compile-refs';
import {generateTypes} from "../../compiler-jay-html/lib/jay-target/jay-html-compile-types";
import {pascalCase} from "change-case";
import path from 'path';
import {LinkedContractResolver} from "./contract-parser";

interface JayContractImportLink {
    module: string;
    viewState: string;
    refs: string;
    repeatedRefs: string;
}

function createJayTypeFromTag(tag: ContractTag, linkedContractResolver: LinkedContractResolver): [JayType, Array<JayContractImportLink>] {
    if (tag.type.includes(ContractTagType.subContract)) {
        if (tag.link) {
            const subContract = linkedContractResolver.loadContract(tag.link);
            const subContractFile = tag.link.replace('.contract.yaml', '')
            const contractName = subContract.name;
            const viewState = `${pascalCase(contractName)}ViewState`;
            const refs = `${pascalCase(contractName)}Refs`;
            const repeatedRefs = `${pascalCase(contractName)}RepeatedRefs`;
            return [new JayImportedContract(
                contractName,
                viewState,
                refs,
                repeatedRefs
            ), [{
                module: subContractFile,
                viewState,
                refs,
                repeatedRefs
            }]];
        }
        const props: Record<string, JayType> = {};
        let importLinks: JayContractImportLink[] = [];
        tag.tags
            .filter(_ => dataVariantOrSubContract(_))
            .map(tag => {
                const [tagType, tagImportLinks] = createJayTypeFromTag(tag, linkedContractResolver);
                importLinks = [...importLinks, ...tagImportLinks];
                props[tag.tag] = tagType
            });

        const objectType = new JayObjectType(pascalCase(tag.tag), props);
        return [tag.repeated ? new JayArrayType(objectType) : objectType, importLinks];
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return [tag.dataType, []];
    } else {
        return [tag.dataType, []];
    }
}

function dataVariantOrSubContract(tag: ContractTag) {
    return tag.type.includes(ContractTagType.data) ||
        tag.type.includes(ContractTagType.variant) ||
        tag.type.includes(ContractTagType.subContract)
}

function collectRefs(tags: ContractTag[], viewStateType: JayType, parentName: string = '', isRepeated: boolean = false): Ref[] {
    const refs: Ref[] = [];

    for (const tag of tags) {
        if (tag.type.includes(ContractTagType.interactive)) {
            const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
            const ref: Ref = {
                ref: tag.tag,
                constName: '',
                dynamicRef: isRepeated,
                autoRef: false,
                viewStateType: viewStateType,
                elementType: { name: elementType, kind: 0 }
            };
            refs.push(ref);
        } else if (tag.type.includes(ContractTagType.subContract)) {
            const subInterfaceName = tag.tag.charAt(0).toUpperCase() + tag.tag.slice(1);
            const subViewStateType = { name: subInterfaceName, kind: 0 };
            refs.push(...collectRefs(tag.tags || [], subViewStateType, subInterfaceName, tag.repeated));
        }
    }

    return refs;
}

function generateRefsInterface(contract: Contract): {imports: Imports, renderedRefs: string} {
    const viewStateType = { name: pascalCase(contract.name) + 'ViewState', kind: 0 };
    const refs = collectRefs(contract.tags, viewStateType);
    const refsType = pascalCase(contract.name) + 'Refs';
    const repeatedRefsType = pascalCase(contract.name) + 'RepeatedRefs';

    // Generate regular refs interface
    const {imports, renderedRefs: regularRefs} = renderRefsType(refs, refsType);
    
    // Generate repeated refs interface by replacing HTMLElementProxy with HTMLElementCollectionProxy
    const repeatedRefs = refs.map(ref => ({
        ...ref,
        dynamicRef: true
    }));
    const {renderedRefs: repeatedRefsRendered} = renderRefsType(repeatedRefs, repeatedRefsType);

    // Combine both interfaces
    const renderedRefs = `${regularRefs}\n\n${repeatedRefsRendered}`;

    return {imports, renderedRefs};
}

function renderImports(imports: Imports, importedLinks: JayContractImportLink[]) {
    const renderedImports = imports.render(ImportsFor.definition);

    const renderedImportedLinks = []
    for (const {module, refs, repeatedRefs, viewState} of importedLinks) {
        let symbols = `${viewState}, ${refs}, ${repeatedRefs}`
        renderedImportedLinks.push(
            `import {${symbols}} from "${module}";`,
        );
    }

    return renderedImports + '\n' + renderedImportedLinks.join('\n');
}

export function compileContract(contractWithValidations: WithValidations<Contract>,
                                linkedContractResolver: LinkedContractResolver): WithValidations<string> {
    return contractWithValidations.map(contract => {
        const props: Record<string, JayType> = {};
        let importedLinks: JayContractImportLink[] = []
        contract.tags
            .filter(_ => dataVariantOrSubContract(_))
            .map(tag => {
                const [tagType, tagImportedLinks] = createJayTypeFromTag(tag, linkedContractResolver);
                importedLinks = [...importedLinks, ...tagImportedLinks];
                props[tag.tag] = tagType;
            });

        const rootType = new JayObjectType(`${pascalCase(contract.name)}ViewState`, props);
        const {imports, renderedRefs} = generateRefsInterface(contract);
        const types = generateTypes(rootType);
        const renderedImports = renderImports(imports, importedLinks);
        return `${renderedImports}\n\n${types}\n\n${renderedRefs}`
    })
}
