import {
    JayArrayType,
    JayObjectType,
    WithValidations,
    Import,
    Imports,
    JayType,
    Ref,
    JayEnumType,
    ImportsFor
} from 'jay-compiler-shared';
import { HTMLElementProxy, HTMLElementCollectionProxy } from 'jay-runtime';
import { Contract, ContractTag, ContractTagType } from './contract';
import { renderRefsType } from '../../compiler-jay-html/lib/jay-target/jay-html-compile-refs';
import {generateTypes} from "../../compiler-jay-html/lib/jay-target/jay-html-compile-types";
import {pascalCase} from "change-case";

function createJayTypeFromTag(tag: ContractTag): JayType {
    if (tag.type.includes(ContractTagType.subContract)) {
        const props: Record<string, JayType> = {};
        tag.tags
            .filter(_ => dataVariantOrSubContract(_))
            .map(tag => {
                props[tag.tag] =  createJayTypeFromTag(tag);
            });

        const objectType = new JayObjectType(pascalCase(tag.tag), props);
        return tag.repeated ? new JayArrayType(objectType) : objectType;
    } else if (tag.type.includes(ContractTagType.variant) && tag.dataType instanceof JayEnumType) {
        return tag.dataType;
    } else {
        return tag.dataType;
    }
}

function dataVariantOrSubContract(tag: ContractTag) {
    return tag.type.includes(ContractTagType.data) ||
        tag.type.includes(ContractTagType.variant) ||
        tag.type.includes(ContractTagType.subContract)
}

function collectRefs(tags: ContractTag[], viewStateType: JayType, parentName: string = ''): Ref[] {
    const refs: Ref[] = [];

    for (const tag of tags) {
        if (tag.type.includes(ContractTagType.interactive)) {
            const ref: Ref = {
                ref: tag.tag,
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: viewStateType,
                elementType: { name: tag.elementType?.[0] || 'HTMLElement', kind: 0 }
            };
            refs.push(ref);
        } else if (tag.type.includes(ContractTagType.subContract)) {
            const subInterfaceName = tag.tag.charAt(0).toUpperCase() + tag.tag.slice(1);
            const subViewStateType = { name: subInterfaceName, kind: 0 };
            refs.push(...collectRefs(tag.tags || [], subViewStateType, subInterfaceName));
        }
    }

    return refs;
}

function generateRefsInterface(contract: Contract): {imports: Imports, renderedRefs: string} {
    const viewStateType = { name: pascalCase(contract.name) + 'ViewState', kind: 0 };
    const refs = collectRefs(contract.tags, viewStateType);
    const refsType = pascalCase(contract.name) + 'Refs';

    return renderRefsType(refs, refsType);
}

export function compileContract(contractWithValidations: WithValidations<Contract>): WithValidations<string> {
    return contractWithValidations.map(contract => {
        const props: Record<string, JayType> = {};

        contract.tags
            .filter(_ => dataVariantOrSubContract(_))
            .map(tag => {
                props[tag.tag] =  createJayTypeFromTag(tag);
            });

        const rootType = new JayObjectType(`${pascalCase(contract.name)}ViewState`, props);
        const {imports, renderedRefs} = generateRefsInterface(contract);
        const types =  generateTypes(rootType);
        return `${imports.render(ImportsFor.definition)}\n\n${types}\n\n${renderedRefs}`
    })
}
