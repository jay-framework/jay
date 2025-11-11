import {
    Import,
    Imports,
    isImportedType,
    isObjectType,
    isRecursiveType,
    JayArrayType,
    JayImportedType,
    JayImportName,
    JayType,
    JayUnknown,
    JayValidations,
    RenderFragment,
} from '@jay-framework/compiler-shared';
import { parse } from './expression-parser.cjs';

export class Accessor {
    readonly rootVar: string;
    readonly terms: Array<string>;
    readonly validations: JayValidations;
    readonly resolvedType: JayType;

    constructor(
        rootVar: string,
        terms: Array<string>,
        validations: JayValidations,
        resolvedType: JayType,
    ) {
        this.rootVar = rootVar;
        this.terms = terms;
        this.validations = validations;
        this.resolvedType = resolvedType;
    }

    render() {
        let renderedAccessor =
            this.terms.length === 1 && this.terms[0] === '.'
                ? this.rootVar
                : this.rootVar + '.' + this.terms.join('?.');
        return new RenderFragment(`${renderedAccessor}`, Imports.none(), this.validations);
    }
}

export class Variables {
    readonly currentVar: string;
    readonly currentType: JayType;
    readonly currentContext: string;
    readonly parent: Variables;
    private readonly children: Record<string, Variables> = {};
    private readonly depth;
    constructor(currentTypes: JayType, parent: Variables = undefined, depth: number = 0) {
        this.currentVar = depth === 0 ? 'vs' : 'vs' + depth;
        this.currentContext = depth === 0 ? 'context' : 'cx' + depth;
        this.depth = depth;
        this.parent = parent;
        this.currentType =
            currentTypes instanceof JayImportedType ? currentTypes.type : currentTypes;
    }

    resolveAccessor(accessor: Array<string>): Accessor {
        let curr: JayType = this.currentType;
        let validations = [];
        accessor.forEach((member) => {
            if (member === '.')
                return; // do not advance curr
            else if (isObjectType(curr) && curr.props[member]) {
                curr = curr.props[member];
                if (isImportedType(curr)) curr = curr.type;
                // Follow recursive type references
                if (isRecursiveType(curr) && curr.resolvedType) curr = curr.resolvedType;
            } else {
                validations.push(`the data field [${accessor.join('.')}] not found in Jay data`);
                curr = JayUnknown;
            }
        });
        return new Accessor(this.currentVar, accessor, validations, curr);
    }

    childVariableFor(accessor: Accessor): Variables {
        const path = accessor.terms.join('.');
        if (this.children[path]) return this.children[path];
        else {
            const resolvedForEachType = (accessor.resolvedType as JayArrayType).itemType;
            const variables = new Variables(resolvedForEachType, this, this.depth + 1);
            this.children[path] = variables;
            return variables;
        }
    }
}

function doParse(expression: string, startRule, vars?: Variables) {
    try {
        return parse(expression, {
            vars,
            RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            da: Imports.for(Import.dynamicAttribute),
            dp: Imports.for(Import.dynamicProperty),
            ba: Imports.for(Import.booleanAttribute),
            startRule,
        });
    } catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}`);
    }
}

export function parseAccessor(expression: string, vars: Variables): Accessor {
    return doParse(expression, 'accessor', vars);
}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'conditionFunc', vars);
}

export function parseReactCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'condition', vars);
}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicText', vars);
}

function unescapeBackslash(jsCode) {
    return jsCode.replace(/\\(.)/g, (match, char) => {
        if (char === '\\') {
            return '\\'; // Retain a single backslash for '\\'
        }
        switch (char) {
            case 't':
                return '\t'; // Tab
            case 'n':
                return '\n'; // Newline
            case 'r':
                return '\r'; // Carriage return
            default:
                return char; // Leave other escaped characters as is
        }
    });
}

export function parseReactTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'reactDynamicText', vars).map((_) => unescapeBackslash(_));
}

export function parseBooleanAttributeExpression(
    expression: string,
    vars: Variables,
): RenderFragment {
    return doParse(expression, 'booleanAttribute', vars);
}

export function parseAttributeExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicAttribute', vars);
}

export function parsePropertyExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicProperty', vars);
}

export function parseReactPropertyExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'reactDynamicProperty', vars);
}

export function parseComponentPropExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicComponentProp', vars);
}

export function parseClassExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'classExpression', vars);
}

export function parseReactClassExpression(expression: string, vars: Variables): RenderFragment {
    const { rendered, validations, refs }: RenderFragment = doParse(
        expression,
        'reactClassExpression',
        vars,
    );
    return new RenderFragment(rendered, Imports.none(), validations, refs);
}

export function parseImportNames(expression: string): JayImportName[] {
    return doParse(expression, 'importNames');
}

export function parseIsEnum(expression: string): boolean {
    try {
        return doParse(expression, 'is_enum');
    } catch (err) {
        return false;
    }
}
export function parseEnumValues(expression: string): string[] {
    return doParse(expression, 'enum');
}
