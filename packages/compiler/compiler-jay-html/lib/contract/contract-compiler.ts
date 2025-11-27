import {
    Import,
    Imports,
    ImportsFor,
    JAY_CONTRACT_EXTENSION,
    mkRefsTree,
    RefsTree,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { Contract } from './contract';
import { generateTypes, JayImportResolver, renderRefsType } from '../';
import { pascalCase } from 'change-case';
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
            const contractName = pascalCase(contract.name);
            const viewStateTypeName = `${contractName}ViewState`;
            const phaseViewStateTypes = generateAllPhaseViewStateTypes(contract, viewStateTypeName);

            // Generate refs interface
            let { imports, renderedRefs } = generateRefsInterface(contract, refs);
            imports = imports.plus(Import.jayContract);

            const renderedImports = renderImports(imports, importLinks);

            // Generate type names
            const refsTypeName = `${contractName}Refs`;
            const slowViewStateTypeName = `${contractName}SlowViewState`;
            const fastViewStateTypeName = `${contractName}FastViewState`;
            const interactiveViewStateTypeName = `${contractName}InteractiveViewState`;

            // Generate contract type with all 5 type parameters
            const contractType = `export type ${contractName}Contract = JayContract<${viewStateTypeName}, ${refsTypeName}, ${slowViewStateTypeName}, ${fastViewStateTypeName}, ${interactiveViewStateTypeName}>`;

            return `${renderedImports}\n\n${fullViewStateTypes}\n\n${phaseViewStateTypes}\n\n${renderedRefs}\n\n${contractType}`;
        });
    });
}
