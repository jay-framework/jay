import {Import, Imports, RenderFragment} from './render-fragment';
import {parse} from '../lib/parse-expressions'
import {isArrayType, isObjectType, JayPrimitiveTypes, JayType} from "./parse-jay-file";

export class Variables {
    private readonly currentVar: string;
    private readonly currentTypes: JayType;
    constructor(currentVar: string, currentTypes: JayType) {
        this.currentVar = currentVar;
        this.currentTypes = currentTypes;
    }

    verifyAccessor(accessor: Array<string>) {
        let curr: JayPrimitiveTypes | JayType | Array<JayType> = this.currentTypes;
        let validations = [];
        accessor.forEach((member, index) => {
            if (curr[member] && isObjectType(member))
                curr = curr[member];
            // else if (curr[member] && isArrayType(member))
            //     ;
            else if (!curr[member])
                validations.push(`the data field [${accessor.join('.')}] not found in Jay data`);
        });
        return validations;
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