import {JayArrayType, JayAtomicType, JayObjectType, JayType, WithValidations} from "jay-compiler-shared";
import {Contract, ContractTag, ContractTagType} from "./contract";
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
    } else {
        return tag.dataType;
    }
}

function dataVariantOrSubContract(tag: ContractTag) {
    return tag.type.includes(ContractTagType.data) ||
        tag.type.includes(ContractTagType.variant) ||
        tag.type.includes(ContractTagType.subContract)
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
        return generateTypes(rootType);
    })
}
