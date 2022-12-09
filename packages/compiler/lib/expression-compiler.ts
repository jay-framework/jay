import {Import, Imports, RenderFragment} from './render-fragment';
import {parse} from '../lib/parse-expressions'
import {JayImportedType, JayImportName, JayObjectType, JayType, JayUnknown} from "./parse-jay-file";
import {JayValidations} from "./with-validations";

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
        if (this.terms.length === 1 && this.terms[0] === ".")
            return 'vs'
        else
            return 'vs.' + this.terms.join('?.');
    }
}

export class Variables {
    readonly currentVar: string;
    readonly currentType: JayType;
    readonly currentContext: string;
    readonly parent: Variables;
    private readonly depth;
    constructor(currentTypes: JayType, parent: Variables = undefined, depth: number = 0) {
        this.currentVar = (depth === 0)?'viewState':'vs'+depth;
        this.currentContext = (depth === 0)?'context':'cx'+depth;
        this.depth = depth;
        this.parent = parent;
        this.currentType = currentTypes instanceof JayImportedType ? currentTypes.type : currentTypes;
    }

    resolveAccessor(accessor: Array<string>): Accessor {
        let curr: JayType = this.currentType;
        let validations = [];
        accessor.forEach((member) => {
            if (member === '.')
                return; // do not advance curr
            else if (curr instanceof JayObjectType && curr.props[member]) {
                curr = curr.props[member];
                if (curr instanceof JayImportedType)
                    curr = curr.type;
            }
            else {
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
            vars, RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            da: Imports.for(Import.dynamicAttribute),
            dp: Imports.for(Import.dynamicProperty),
            startRule
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

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicText', vars);
}

export function parseAttributeExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicAttribute', vars);
}

export function parsePropertyExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicProperty', vars);
}

export function parseComponentPropExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'dynamicComponentProp', vars);
}

export function parseClassExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, 'classExpression', vars);
}

export function parseImportNames(expression: string): JayImportName[] {
    return doParse(expression, 'importNames');
}

export function parseIsEnum(expression: string): boolean {
    try {
        return doParse(expression, 'is_enum');
    }
    catch (err) {
        return false;
    }
}
export function parseEnumValues(expression: string): string[] {
    return doParse(expression, 'enum');
}