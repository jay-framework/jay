import { JAY_4_REACT, JAY_FULLSTACK_COMPONENTS, JAY_RUNTIME, JAY_SECURE } from './constants';

export enum ImportsFor {
    definition,
    implementation,
    elementSandbox,
}

export interface ImportName {
    index: number;
    statement: string;
    module: string;
    usage: ImportsFor[];
}

let nextKey = 0;
function importStatementFragment(
    module: string,
    statement: string,
    ...usage: ImportsFor[]
): ImportName {
    return { module, index: nextKey++, statement, usage };
}

const importsOrder = {
    JAY_RUNTIME: 1,
    JAY_SECURE: 2,
    REACT: 3,
    JAY_4_REACT: 4,
};
export const Import = {
    baseJayElement: importStatementFragment(
        JAY_RUNTIME,
        'BaseJayElement',
        ImportsFor.implementation,
        ImportsFor.elementSandbox,
    ),
    jayElement: importStatementFragment(
        JAY_RUNTIME,
        'JayElement',
        ImportsFor.definition,
        ImportsFor.implementation,
        ImportsFor.elementSandbox,
    ),
    element: importStatementFragment(JAY_RUNTIME, 'element as e', ImportsFor.implementation),
    svgElement: importStatementFragment(
        JAY_RUNTIME,
        'svgElement as svg',
        ImportsFor.implementation,
    ),
    mathMlElement: importStatementFragment(
        JAY_RUNTIME,
        'mathMLElement as ml',
        ImportsFor.implementation,
    ),
    dynamicText: importStatementFragment(
        JAY_RUNTIME,
        'dynamicText as dt',
        ImportsFor.implementation,
    ),
    dynamicAttribute: importStatementFragment(
        JAY_RUNTIME,
        'dynamicAttribute as da',
        ImportsFor.implementation,
    ),
    booleanAttribute: importStatementFragment(
        JAY_RUNTIME,
        'booleanAttribute as ba',
        ImportsFor.implementation,
    ),
    dynamicProperty: importStatementFragment(
        JAY_RUNTIME,
        'dynamicProperty as dp',
        ImportsFor.implementation,
    ),
    RenderElement: importStatementFragment(
        JAY_RUNTIME,
        'RenderElement',
        ImportsFor.implementation,
        ImportsFor.definition,
        ImportsFor.elementSandbox,
    ),
    ReferencesManager: importStatementFragment(
        JAY_RUNTIME,
        'ReferencesManager',
        ImportsFor.implementation,
    ),
    SecureReferencesManager: importStatementFragment(
        JAY_SECURE,
        'SecureReferencesManager',
        ImportsFor.elementSandbox,
    ),
    conditional: importStatementFragment(
        JAY_RUNTIME,
        'conditional as c',
        ImportsFor.implementation,
    ),
    withData: importStatementFragment(JAY_RUNTIME, 'withData', ImportsFor.implementation),
    dynamicElement: importStatementFragment(
        JAY_RUNTIME,
        'dynamicElement as de',
        ImportsFor.implementation,
    ),
    svgDynamicElement: importStatementFragment(
        JAY_RUNTIME,
        'svgDynamicElement as dsvg',
        ImportsFor.implementation,
    ),
    mathMLDynamicElement: importStatementFragment(
        JAY_RUNTIME,
        'mathMLDynamicElement as dml',
        ImportsFor.implementation,
    ),
    forEach: importStatementFragment(JAY_RUNTIME, 'forEach', ImportsFor.implementation),
    slowForEachItem: importStatementFragment(JAY_RUNTIME, 'slowForEachItem', ImportsFor.implementation),
    resolved: importStatementFragment(JAY_RUNTIME, 'resolved', ImportsFor.implementation),
    pending: importStatementFragment(JAY_RUNTIME, 'pending', ImportsFor.implementation),
    rejected: importStatementFragment(JAY_RUNTIME, 'rejected', ImportsFor.implementation),
    ConstructContext: importStatementFragment(
        JAY_RUNTIME,
        'ConstructContext',
        ImportsFor.implementation,
    ),
    HTMLElementCollectionProxy: importStatementFragment(
        JAY_RUNTIME,
        'HTMLElementCollectionProxy',
        ImportsFor.definition,
        ImportsFor.implementation,
        ImportsFor.elementSandbox,
    ),
    HTMLElementProxy: importStatementFragment(
        JAY_RUNTIME,
        'HTMLElementProxy',
        ImportsFor.definition,
        ImportsFor.implementation,
        ImportsFor.elementSandbox,
    ),
    childComp: importStatementFragment(JAY_RUNTIME, 'childComp', ImportsFor.implementation),
    elemRef: importStatementFragment(JAY_RUNTIME, 'elemRef as er', ImportsFor.implementation),
    elemCollectionRef: importStatementFragment(
        JAY_RUNTIME,
        'elemCollectionRef as ecr',
        ImportsFor.implementation,
    ),
    compRef: importStatementFragment(JAY_RUNTIME, 'compRef as cr', ImportsFor.implementation),
    compCollectionRef: importStatementFragment(
        JAY_RUNTIME,
        'compCollectionRef as ccr',
        ImportsFor.implementation,
    ),
    RenderElementOptions: importStatementFragment(
        JAY_RUNTIME,
        'RenderElementOptions',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    MapEventEmitterViewState: importStatementFragment(
        JAY_RUNTIME,
        'MapEventEmitterViewState',
        ImportsFor.implementation,
        ImportsFor.definition,
        ImportsFor.elementSandbox,
    ),
    OnlyEventEmitters: importStatementFragment(
        JAY_RUNTIME,
        'OnlyEventEmitters',
        ImportsFor.implementation,
        ImportsFor.definition,
        ImportsFor.elementSandbox,
    ),
    ComponentCollectionProxy: importStatementFragment(
        JAY_RUNTIME,
        'ComponentCollectionProxy',
        ImportsFor.implementation,
        ImportsFor.definition,
        ImportsFor.elementSandbox,
    ),
    sandboxElementBridge: importStatementFragment(
        JAY_SECURE,
        'elementBridge',
        ImportsFor.elementSandbox,
    ),
    sandboxRoot: importStatementFragment(JAY_SECURE, 'sandboxRoot', ImportsFor.elementSandbox),
    sandboxElement: importStatementFragment(
        JAY_SECURE,
        'sandboxElement as e',
        ImportsFor.elementSandbox,
    ),
    sandboxChildComp: importStatementFragment(
        JAY_SECURE,
        'sandboxChildComp as childComp',
        ImportsFor.elementSandbox,
    ),
    sandboxElemRef: importStatementFragment(JAY_SECURE, 'elemRef as er', ImportsFor.elementSandbox),
    sandboxElemCollectionRef: importStatementFragment(
        JAY_SECURE,
        'elemCollectionRef as ecr',
        ImportsFor.elementSandbox,
    ),
    sandboxCompRef: importStatementFragment(JAY_SECURE, 'compRef as cr', ImportsFor.elementSandbox),
    sandboxCompCollectionRef: importStatementFragment(
        JAY_SECURE,
        'compCollectionRef as ccr',
        ImportsFor.elementSandbox,
    ),
    sandboxForEach: importStatementFragment(
        JAY_SECURE,
        'sandboxForEach as forEach',
        ImportsFor.elementSandbox,
    ),
    handshakeMessageJayChannel: importStatementFragment(
        JAY_SECURE,
        'HandshakeMessageJayChannel',
        ImportsFor.elementSandbox,
    ),
    jayPort: importStatementFragment(JAY_SECURE, 'JayPort', ImportsFor.elementSandbox),
    setWorkerPort: importStatementFragment(JAY_SECURE, 'setWorkerPort', ImportsFor.elementSandbox),
    secureMainRoot: importStatementFragment(
        JAY_SECURE,
        'mainRoot as mr',
        ImportsFor.implementation,
    ),
    secureChildComp: importStatementFragment(
        JAY_SECURE,
        'secureChildComp',
        ImportsFor.implementation,
    ),
    functionRepository: importStatementFragment(
        './function-repository',
        'funcRepository',
        ImportsFor.implementation,
    ),
    ReactElement: importStatementFragment(
        `react`,
        'ReactElement',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    Jay4ReactElementProps: importStatementFragment(
        JAY_4_REACT,
        'Jay4ReactElementProps',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    eventsFor: importStatementFragment(
        JAY_4_REACT,
        'eventsFor',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    jay2React: importStatementFragment(
        JAY_4_REACT,
        'jay2React',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    mimicJayElement: importStatementFragment(
        JAY_4_REACT,
        'mimicJayElement',
        ImportsFor.implementation,
        ImportsFor.definition,
    ),
    jayContract: importStatementFragment(
        JAY_RUNTIME,
        'JayContract',
        ImportsFor.implementation,
        ImportsFor.definition,
        ImportsFor.elementSandbox,
    ),
    injectHeadLinks: importStatementFragment(
        JAY_RUNTIME,
        'injectHeadLinks',
        ImportsFor.implementation,
    ),
};

export class Imports {
    constructor(private readonly imports: Array<boolean>) {}

    plus(addImport: ImportName | Imports): Imports {
        if (addImport instanceof Imports) {
            return Imports.merge(this, addImport);
        } else {
            let newImports: Array<boolean> = [...this.imports];
            newImports[addImport.index] = true;
            return new Imports(newImports);
        }
    }

    minus(removeImport: ImportName | Imports): Imports {
        if (removeImport instanceof Imports) {
            let newImports: Array<boolean> = [...this.imports];
            for (let i = 0; i < removeImport.imports.length; i++) {
                if (removeImport.imports[i]) {
                    newImports[i] = false;
                }
            }
            return new Imports(newImports);
        } else {
            let newImports: Array<boolean> = [...this.imports];
            newImports[removeImport.index] = false;
            return new Imports(newImports);
        }
    }

    has(anImport: ImportName) {
        return !!this.imports[anImport.index];
    }

    render(importsFor: ImportsFor) {
        let moduleImportStatements: Map<string, string[]> = new Map();
        for (let importKey in Import) {
            let importName = Import[importKey];
            if (this.imports[importName.index] && importName.usage.includes(importsFor)) {
                if (moduleImportStatements.has(importName.module))
                    moduleImportStatements.get(importName.module).push(importName.statement);
                else moduleImportStatements.set(importName.module, [importName.statement]);
            }
        }

        const modulesToImport = [...moduleImportStatements.keys()].sort(
            (a, b) => (importsOrder[a] || 999) - (importsOrder[b] || 999),
        );

        return modulesToImport
            .map(
                (module) =>
                    `import {${moduleImportStatements.get(module).join(', ')}} from "${module}";`,
            )
            .join('\n');
    }

    static none(): Imports {
        return new Imports([]);
    }

    static for(...imports: Array<ImportName>): Imports {
        let newImports = Imports.none();
        imports.forEach((anImport) => (newImports = newImports.plus(anImport)));
        return newImports;
    }

    static merge(imports1: Imports, imports2: Imports): Imports {
        let merged = [];
        for (let i = 0; i < Math.max(imports1.imports.length, imports2.imports.length); i++)
            merged[i] = imports1.imports[i] || imports2.imports[i];
        return new Imports(merged);
    }
}
