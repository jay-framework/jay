import {Import, Imports, RenderFragment} from './render-fragment';
import {parse} from '../lib/parse-expressions'
import {JayObjectType, JayType, JayUnknown} from "./parse-jay-file";
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
        return this.terms.join('.');
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
        this.currentType = currentTypes;
    }

    resolveAccessor(accessor: Array<string>): Accessor {
        let curr: JayType = this.currentType;
        let validations = [];
        accessor.forEach((member) => {
            if (curr instanceof JayObjectType && curr.props[member]) {
                curr = curr.props[member];
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

function doParse(expression: string, vars: Variables, startRule) {
    try {
        return parse(expression, {
            vars, RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            da: Imports.for(Import.dynamicAttribute),
            startRule
        });
    } catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}`);
    }
}

export function parseIdentifier(expression: string, vars: Variables): RenderFragment {
    return new RenderFragment(doParse(expression, vars, 'Identifier'), Imports.none());
}

export function parseAccessor(expression: string, vars: Variables): Accessor {
    return doParse(expression, vars, 'accessor');
}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'condition');
}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'template');
}

export function parseClassExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'classExpression');
}