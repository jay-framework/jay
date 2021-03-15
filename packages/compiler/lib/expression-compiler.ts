import {Import, Imports, RenderFragment} from './render-fragment';
import {parse} from '../lib/parse-expressions'
import {isArrayType, isObjectType, JayPrimitiveTypes, JayType} from "./parse-jay-file";
import {JayValidations} from "./with-validations";

export class Variables {
    readonly currentVar: string;
    readonly currentTypes: JayPrimitiveTypes | JayType | Array<JayType>;
    readonly parent: Variables;
    private readonly depth;
    constructor(currentTypes: JayPrimitiveTypes | JayType | Array<JayType>, parent: Variables = undefined, depth: number = 0) {
        if (depth === 0)
            this.currentVar = 'viewState';
        else
            this.currentVar = 'vs' + depth;
        this.depth = depth;
        this.parent = parent;
        this.currentTypes = currentTypes;
    }

    resolveType(accessor: Array<string>): {validations: JayValidations, resolvedType: JayPrimitiveTypes | JayType | Array<JayType>} {
        let curr: JayPrimitiveTypes | JayType | Array<JayType> = this.currentTypes;
        let validations = [];
        accessor.forEach((member) => {
            if (curr[member] && isObjectType(member))
                curr = curr[member];
            // else if (curr[member] && isArrayType(member))
            //     ;
            else if (!curr[member])
                validations.push(`the data field [${accessor.join('.')}] not found in Jay data`);
            else
                curr = curr[member];
        });
        return {validations, resolvedType: curr};
    }

    childVariableFor(resolvedForEachType: JayPrimitiveTypes | JayType | Array<JayType>): Variables {
        return new Variables(resolvedForEachType, this, this.depth + 1);
    }
}

function doParse(expression: string, vars: Variables, startRule) {
    try {
        return parse(expression, {
            vars, RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            startRule
        });
    } catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}`);
    }
}

export function parseIdentifier(expression: string, vars: Variables): RenderFragment {
    return new RenderFragment(doParse(expression, vars, 'Identifier'), Imports.none());
}

export function parseAccessorFunc(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'accessorFunction');
}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'condition');
}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    return doParse(expression, vars, 'start');
}