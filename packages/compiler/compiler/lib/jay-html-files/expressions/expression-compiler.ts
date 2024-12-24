import { RenderFragment } from 'jay-compiler-shared';
import { parse } from './expression-parser.cjs';
import { JayValidations } from 'jay-compiler-shared';
import { Import, Imports } from 'jay-compiler-shared';
import { JayImportedType, JayObjectType, JayType, JayUnknown } from 'jay-compiler-shared';
import { JayImportName } from 'jay-compiler-shared';

export class Accessor {
    readonly terms: Array<string>;
    readonly validations: JayValidations;
    readonly resolvedType: JayType;

    constructor(terms: Array<string>, validations: JayValidations, resolvedType: JayType) {
        this.terms = terms;
        this.validations = validations;
        this.resolvedType = resolvedType;
    }

    render() {
        let renderedAccessor =
            this.terms.length === 1 && this.terms[0] === '.' ? 'vs' : 'vs.' + this.terms.join('?.');
        return new RenderFragment(`${renderedAccessor}`, Imports.none(), this.validations);
    }
}

export class Variables {
    readonly currentVar: string;
    readonly currentType: JayType;
    readonly currentContext: string;
    readonly parent: Variables;
    private readonly depth;
    constructor(currentTypes: JayType, parent: Variables = undefined, depth: number = 0) {
        this.currentVar = depth === 0 ? 'viewState' : 'vs' + depth;
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
            else if (curr instanceof JayObjectType && curr.props[member]) {
                curr = curr.props[member];
                if (curr instanceof JayImportedType) curr = curr.type;
            } else {
                validations.push(`the data field [${accessor.join('.')}] not found in Jay data`);
                curr = JayUnknown;
            }
        });
        return new Accessor(accessor, validations, curr);
    }

    childVariableFor(resolvedForEachType: JayType): Variables {
        return new Variables(resolvedForEachType, this, this.depth + 1);
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

export function parseIdentifier(expression: string, vars: Variables): RenderFragment {
    return new RenderFragment(doParse(expression, 'Identifier', vars), Imports.none());
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
            case 't': return '\t'; // Tab
            case 'n': return '\n'; // Newline
            case 'r': return '\r'; // Carriage return
            default: return char; // Leave other escaped characters as is
        }
    });
}

export function parseReactTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'reactDynamicText', vars)
        .map(_ => unescapeBackslash(_));
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
    const {rendered, validations, refs}: RenderFragment = doParse(expression, 'reactClassExpression', vars)
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
