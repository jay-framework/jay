import {
    Import,
    Imports,
    ImportsFor,
    JAY_CONTRACT_EXTENSION,
    refsTree,
    RefsTree,
    WithValidations,
} from 'jay-compiler-shared';
import {Contract} from './contract';
import {generateTypes, JayImportResolver, renderRefsType} from '../';
import {pascalCase} from 'change-case';
import {contractToImportsViewStateAndRefs, JayContractImportLink} from "./contract-to-view-state-and-refs";

function refsToRepeated(refsTreeNode: RefsTree): RefsTree {
    const {refs, children, imported} = refsTreeNode;
    return refsTree(
        refs.map((ref) => ({
            ...ref,
            dynamicRef: true,
        })),
        Object.fromEntries(
            Object.entries(children).map(([key, value]) => [key, refsToRepeated(value)])),
        true,
        imported?.refsTypeName,
        imported?.repeatedRefsTypeName
    )
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

    // Generate regular refs interface
    const { imports, renderedRefs: regularRefs } = renderRefsType(refs, refsType);

    // Generate repeated refs interface by replacing HTMLElementProxy with HTMLElementCollectionProxy
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

        const contractTypes =
            await contractToImportsViewStateAndRefs(contract, contractFilePath, jayImportResolver);

        return contractTypes.map(contractTypesResult => {
            const {type, refs, importLinks} = contractTypesResult;
            const types = generateTypes(type);
            let { imports, renderedRefs } = generateRefsInterface(contract, refs);
            imports = imports
                .plus(Import.jayElement)
                .plus(Import.RenderElement)
                .plus(Import.RenderElementOptions);
            const renderedImports = renderImports(imports, importLinks);

            const elementType = `export type ${pascalCase(contract.name)}Element = JayElement<${pascalCase(contract.name)}ViewState, ${pascalCase(contract.name)}Refs>`;
            const elementRenderType = `export type ${pascalCase(contract.name)}ElementRender = RenderElement<${pascalCase(contract.name)}ViewState, ${pascalCase(contract.name)}Refs, ${pascalCase(contract.name)}Element>`;
            const elementPreRenderType = `export type ${pascalCase(contract.name)}ElementPreRender = [${pascalCase(contract.name)}Refs, ${pascalCase(contract.name)}ElementRender]`;
            const renderFunction = `export declare function render(options?: RenderElementOptions): ${pascalCase(contract.name)}ElementPreRender`;

            return `${renderedImports}\n\n${types}\n\n${renderedRefs}\n\n${elementType}\n${elementRenderType}\n${elementPreRenderType}\n\n${renderFunction}`;
        })
    });
}
