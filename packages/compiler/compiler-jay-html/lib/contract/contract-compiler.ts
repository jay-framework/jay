import {
    Import,
    Imports,
    ImportsFor,
    isAtomicType,
    isEnumType,
    JAY_CONTRACT_EXTENSION,
    mkRefsTree,
    RefsTree,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { JAY_FULLSTACK_COMPONENTS } from '@jay-framework/compiler-shared';
import { Contract, ContractParam, ContractProp } from './contract';
import { generateTypes, JayImportResolver, renderRefsType } from '../';
import { pascalCase, camelCase } from 'change-case';
import {
    contractToImportsViewStateAndRefs,
    JayContractImportLink,
} from './contract-to-view-state-and-refs';
import { generateAllPhaseViewStateTypes } from './phase-type-generator';

function refsToRepeated(refsTreeNode: RefsTree): RefsTree {
    const { refs, children, imported } = refsTreeNode;
    return mkRefsTree(
        refs.map((ref) => ({
            ...ref,
            repeated: true,
        })),
        Object.fromEntries(
            Object.entries(children).map(([key, value]) => [key, refsToRepeated(value)]),
        ),
        true,
        imported?.refsTypeName,
        imported?.repeatedRefsTypeName,
    );
}

function generateRefsInterface(
    contract: Contract,
    refs: RefsTree,
): {
    imports: Imports;
    renderedRefs: string;
} {
    const refsType = pascalCase(contract.name) + 'Refs';
    const repeatedRefsType = pascalCase(contract.name) + 'RepeatedRefs';

    const { imports, renderedRefs: regularRefs } = renderRefsType(refs, refsType);

    const repeatedRefs = refsToRepeated(refs);
    const { imports: imports2, renderedRefs: repeatedRefsRendered } = renderRefsType(
        repeatedRefs,
        repeatedRefsType,
    );

    // Combine both interfaces
    const renderedRefs = `${regularRefs}\n\n${repeatedRefsRendered}`;

    return { imports: imports.plus(imports2), renderedRefs };
}

function generatePropsInterface(
    contractName: string,
    props: ContractProp[],
): { propsInterface: string; propsEnums: string } {
    const propsTypeName = `${contractName}Props`;
    const enums: string[] = [];

    if (props.length === 0) {
        return { propsInterface: `export interface ${propsTypeName} {}`, propsEnums: '' };
    }

    const propLines = props.map((prop) => {
        const propName = camelCase(prop.name);
        const optional = prop.required ? '' : '?';
        let typeName: string;

        if (isEnumType(prop.dataType)) {
            typeName = prop.dataType.name;
            const genEnum = `export enum ${prop.dataType.name} {\n${prop.dataType.values
                .map((_) => '  ' + _)
                .join(',\n')}\n}`;
            enums.push(genEnum);
        } else if (isAtomicType(prop.dataType)) {
            typeName = prop.dataType.name;
        } else {
            typeName = prop.dataType.name;
        }

        return `  ${propName}${optional}: ${typeName};`;
    });

    const propsInterface = `export interface ${propsTypeName} {\n${propLines.join('\n')}\n}`;
    const propsEnums = enums.join('\n\n');

    return { propsInterface, propsEnums };
}

/** Generate Params interface (Design Log #85: URL/load params; always string). */
function generateParamsInterface(
    contractName: string,
    params: ContractParam[],
): { paramsImport: string; paramsInterface: string } {
    const paramsTypeName = `${contractName}Params`;
    const paramLines = params.map((param) => `  ${camelCase(param.name)}: string;`);
    const paramsImport = `import { UrlParams } from '${JAY_FULLSTACK_COMPONENTS}';`;
    const paramsInterface = `export interface ${paramsTypeName} extends UrlParams {\n${paramLines.join('\n')}\n}`;
    return { paramsImport, paramsInterface };
}

function renderImports(imports: Imports, importedLinks: JayContractImportLink[]) {
    const renderedImports = imports.render(ImportsFor.definition);

    // Use a Set to deduplicate import statements
    const renderedImportedLinks = new Set<string>();
    for (const { module, refs, repeatedRefs, viewState } of importedLinks) {
        let symbols = `${viewState}, ${refs}, ${repeatedRefs}`;
        renderedImportedLinks.add(`import {${symbols}} from "${module}${JAY_CONTRACT_EXTENSION}";`);
    }

    return renderedImports + '\n' + Array.from(renderedImportedLinks).join('\n');
}

export async function compileContract(
    contractWithValidations: WithValidations<Contract>,
    contractFilePath: string,
    jayImportResolver: JayImportResolver,
): Promise<WithValidations<string>> {
    return contractWithValidations.flatMapAsync(async (contract) => {
        // Generate full ViewState (for backward compatibility and full type)
        const fullViewStateResult = await contractToImportsViewStateAndRefs(
            contract,
            contractFilePath,
            jayImportResolver,
        );

        return fullViewStateResult.map((fullResult) => {
            const { type, refs, importLinks } = fullResult;

            // Generate full ViewState types
            const fullViewStateTypes = generateTypes(type);

            // Generate phase-specific ViewState types using Pick utilities
            ``; // Pass import resolver to resolve linked contracts with mixed phases
            const contractName = pascalCase(contract.name);
            const viewStateTypeName = `${contractName}ViewState`;
            const phaseViewStateTypes = generateAllPhaseViewStateTypes(
                contract,
                viewStateTypeName,
                jayImportResolver,
                contractFilePath,
            );

            // Generate refs interface
            let { imports, renderedRefs } = generateRefsInterface(contract, refs);
            imports = imports.plus(Import.jayContract);

            const renderedImports = renderImports(imports, importLinks);

            // Generate type names
            const refsTypeName = `${contractName}Refs`;
            const slowViewStateTypeName = `${contractName}SlowViewState`;
            const fastViewStateTypeName = `${contractName}FastViewState`;
            const interactiveViewStateTypeName = `${contractName}InteractiveViewState`;

            // Generate props interface if contract has props
            const hasProps = contract.props && contract.props.length > 0;
            const propsTypeName = `${contractName}Props`;
            let renderedProps = '';
            if (hasProps) {
                const { propsInterface, propsEnums } = generatePropsInterface(
                    contractName,
                    contract.props,
                );
                renderedProps = propsEnums ? `${propsEnums}\n\n${propsInterface}` : propsInterface;
            }

            // Generate params interface if contract has params (Design Log #85: URL/load params)
            const hasParams = contract.params && contract.params.length > 0;
            const paramsTypeName = `${contractName}Params`;
            let renderedParams = '';
            if (hasParams) {
                const { paramsImport, paramsInterface } = generateParamsInterface(
                    contractName,
                    contract.params,
                );
                renderedParams = `${paramsImport}\n\n${paramsInterface}`;
            }

            // Generate contract type - include Props if contract has props
            const contractTypeParams = hasProps
                ? `${viewStateTypeName}, ${refsTypeName}, ${slowViewStateTypeName}, ${fastViewStateTypeName}, ${interactiveViewStateTypeName}, ${propsTypeName}`
                : `${viewStateTypeName}, ${refsTypeName}, ${slowViewStateTypeName}, ${fastViewStateTypeName}, ${interactiveViewStateTypeName}`;
            const contractType = `export type ${contractName}Contract = JayContract<${contractTypeParams}>`;

            const sections = [
                renderedImports,
                fullViewStateTypes,
                phaseViewStateTypes,
                renderedRefs,
                ...(renderedProps ? [renderedProps] : []),
                ...(renderedParams ? [renderedParams] : []),
                contractType,
            ];
            return sections.join('\n\n');
        });
    });
}
