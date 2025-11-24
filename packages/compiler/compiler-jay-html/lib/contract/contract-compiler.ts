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
    contractToAllPhaseViewStates,
    JayContractImportLink,
} from './contract-to-view-state-and-refs';

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

        // Generate phase-specific ViewStates
        const phaseViewStatesResult = await contractToAllPhaseViewStates(
            contract,
            contractFilePath,
            jayImportResolver,
        );

        return fullViewStateResult.flatMap((fullResult) =>
            phaseViewStatesResult.map((phaseResults) => {
                const { type, refs, importLinks } = fullResult;
                const { slow, fast, interactive } = phaseResults;

                // Generate type definitions
                const fullViewStateTypes = generateTypes(type);
                const slowViewStateTypes = slow.type ? generateTypes(slow.type) : '';
                const fastViewStateTypes = fast.type ? generateTypes(fast.type) : '';
                const interactiveViewStateTypes = interactive.type ? generateTypes(interactive.type) : '';

                // Deduplicate enum declarations
                // Enums appear in generateTypes output - we need to extract and deduplicate them
                const allTypesRaw = [
                    fullViewStateTypes,
                    slowViewStateTypes,
                    fastViewStateTypes,
                    interactiveViewStateTypes,
                ].filter(Boolean).join('\n\n');
                
                // Extract enum declarations and deduplicate
                const enumPattern = /(export enum \w+ \{[^}]+\})/g;
                const enumsFound = new Map<string, string>();
                const enumMatches = allTypesRaw.matchAll(enumPattern);
                for (const match of enumMatches) {
                    const enumDecl = match[1];
                    const enumName = enumDecl.match(/export enum (\w+)/)?.[1];
                    if (enumName && !enumsFound.has(enumName)) {
                        enumsFound.set(enumName, enumDecl);
                    }
                }
                
                // Remove all enum declarations from the combined types
                let allTypesWithoutEnums = allTypesRaw;
                for (const enumDecl of enumsFound.values()) {
                    // Replace all occurrences with empty string
                    allTypesWithoutEnums = allTypesWithoutEnums.split(enumDecl).join('');
                }
                
                // Clean up extra whitespace
                allTypesWithoutEnums = allTypesWithoutEnums.replace(/\n{3,}/g, '\n\n').trim();
                
                // Combine enums at the top, then the rest of the types
                const enumsString = Array.from(enumsFound.values()).join('\n\n');
                const allTypes = enumsString ? `${enumsString}\n\n${allTypesWithoutEnums}` : allTypesWithoutEnums;

                // Generate refs interface
                let { imports, renderedRefs } = generateRefsInterface(contract, refs);
                imports = imports.plus(Import.jayContract);

                // Collect all import links (from all phases)
                const allImportLinks = [
                    ...importLinks,
                    ...slow.importLinks,
                    ...fast.importLinks,
                    ...interactive.importLinks,
                ];
                const renderedImports = renderImports(imports, allImportLinks);

                // Generate type names
                const contractName = pascalCase(contract.name);
                const viewStateTypeName = `${contractName}ViewState`;
                const refsTypeName = `${contractName}Refs`;
                const slowViewStateTypeName = `${contractName}SlowViewState`;
                const fastViewStateTypeName = `${contractName}FastViewState`;
                const interactiveViewStateTypeName = `${contractName}InteractiveViewState`;

                // Generate contract type with all 5 type parameters
                const contractType = `export type ${contractName}Contract = JayContract<${viewStateTypeName}, ${refsTypeName}, ${slowViewStateTypeName}, ${fastViewStateTypeName}, ${interactiveViewStateTypeName}>`;

                return `${renderedImports}\n\n${allTypes}\n\n${renderedRefs}\n\n${contractType}`;
            })
        );
    });
}
