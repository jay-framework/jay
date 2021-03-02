import {pascalCase} from 'change-case';
import {WithValidations} from "./with-validations";
import {isArrayType, isObjectType, JayFile, JayType, parseJayFile} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";


function renderInterface(types: JayType, name: String): string {

    let childInterfaces = [];

    let genInterface = `interface ${name} {\n`;
    genInterface += Object
        .keys(types)
        .map(prop => {
            if (isObjectType(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop] as JayType, pascalCase(name)));
                return `  ${prop}: ${pascalCase(name)}`;
            }
            else if (isArrayType(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop][0] as JayType, pascalCase(name)));
                return `  ${prop}: Array<${pascalCase(name)}>`;
            }
            else
                return `  ${prop}: ${types[prop]}`;
        })
        .join(',\n');
    genInterface += '\n}';
    return [...childInterfaces, genInterface].join('\n\n');
}

export function generateTypes(types: JayType): string {
    return renderInterface(types, 'ViewState');
}


enum Import {
    jayElement,
    element,
    dynamicText
}
class Imports {
    private readonly imports: Array<boolean>;
    constructor(newImports: Array<boolean>) {
        this.imports = newImports;
    }

    plus(addImport: Import) {
        let newImports: Array<boolean> = [...this.imports];
        newImports[addImport] = true;
        return new Imports(newImports)
    }

    has(anImport: Import) {
        return !!this.imports[anImport];
    }
    static none(): Imports {
        return new Imports([]);
    }
    static for(...imports: Array<Import>): Imports {
        let newImports = Imports.none();
        imports.forEach(anImport => newImports = newImports.plus(anImport))
        return newImports;
    }
    static merge(imports1: Imports, imports2: Imports) {
        let merged = [];
        for (let i =0; i < Math.max(imports1.imports.length, imports2.imports.length); i++)
            merged[i] = imports1.imports[i] || imports2.imports[i];
        return new Imports(merged);
    }
}

function renderImports(imports: Imports): string {
    let renderedImports = [];
    if (imports.has(Import.jayElement)) renderedImports.push('JayElement');
    if (imports.has(Import.element)) renderedImports.push('element as e');
    if (imports.has(Import.dynamicText)) renderedImports.push('dynamicText as dt');
    return `import {${renderedImports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

class RenderFragment {
    rendered: string;
    imports: Imports;
    constructor(rendered: string, imports: Imports) {
        this.rendered = rendered;
        this.imports = imports;
    }

    static empty(): RenderFragment {
        return new RenderFragment('', Imports.none())
    }

    static merge(fragment1: RenderFragment, fragment2: RenderFragment): RenderFragment {
        if (!!fragment1.rendered && !!fragment2.rendered)
            return new RenderFragment(`${fragment1.rendered}, ${fragment2.rendered}`,
                Imports.merge(fragment1.imports, fragment2.imports))
        else if (!!fragment1.rendered)
            return fragment1
        else
            return fragment2;
    }
}

const parseText = /{(.+?)}/g
function renderTextNode(currentDataVar: string, text: string): RenderFragment {
    let isTemplateString = false;
    let templateString = text.replace(parseText, (fullMatch,group1) => {
        isTemplateString = true;
        // todo handle different types and type formatters
        return `\${vs.${group1}}`;
    })

    if (!isTemplateString)
        return new RenderFragment(`'${text}'`, Imports.none())
    else {
        // todo add import dt
        return new RenderFragment(`dt(${currentDataVar}, vs => \`${templateString}\`)`, Imports.for(Import.dynamicText));
    }

}

function renderNode(currentDataVar: string, node: Node): RenderFragment {
    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(currentDataVar, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            let childRenders = node.childNodes.map(_ => renderNode(currentDataVar, _))
                .reduce((prev, current) => RenderFragment.merge(prev, current), RenderFragment.empty())
            return new RenderFragment(`e('${htmlElement.rawTagName}', {}, [${childRenders.rendered}])`,
                childRenders.imports.plus(Import.element));
        case NodeType.COMMENT_NODE:
            break
    }
}

function firstElementChild(node: Node): HTMLElement {
    // todo validate there is only one child
    return node.childNodes.find(child => child.nodeType === NodeType.ELEMENT_NODE) as HTMLElement;
}

function renderFunctionImplementation(rootBodyElement: HTMLElement): RenderFragment {
    let renderedRoot = renderNode(`viewState`, firstElementChild(rootBodyElement));
    let body = `export function render(viewState: ViewState): JayElement<ViewState> {
  return ${renderedRoot.rendered}
}`;
    return new RenderFragment(body, renderedRoot.imports);
}

export function generateDefinitionFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(Imports.for(Import.jayElement)),
            types,
            renderFunctionDecleration()
        ].join('\n\n');
    })
}

export function generateRuntimeFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let renderedImplementation = renderFunctionImplementation(jayFile.body);
        return [renderImports(renderedImplementation.imports.plus(Import.element)),
            types,
            renderedImplementation.rendered
        ].join('\n\n');
    })
}