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
        const contractTypes = await contractToImportsViewStateAndRefs(
            contract,
            contractFilePath,
            jayImportResolver,
        );

        return contractTypes.map((contractTypesResult) => {
            const { type, refs, importLinks } = contractTypesResult;
            const types = generateTypes(type);
            let { imports, renderedRefs } = generateRefsInterface(contract, refs);
            imports = imports.plus(Import.jayContract);
            const renderedImports = renderImports(imports, importLinks);

            const viewStateTypeName = `${pascalCase(contract.name)}ViewState`;
            const refsTypeName = `${pascalCase(contract.name)}Refs`;
            const contractType = `export type ${pascalCase(contract.name)}Contract = JayContract<${viewStateTypeName}, ${refsTypeName}>`;

            return `${renderedImports}\n\n${types}\n\n${renderedRefs}\n\n${contractType}`;
        });
    });
}
