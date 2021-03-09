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

export function parseAccessor(expression: string, vars: Variables): RenderFragment {

}

export function parseCondition(expression: string, vars: Variables): RenderFragment {
    try {
        return parse(expression, {
            vars, RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText),
            startRule: "condition"
        });
    }
    catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}` );
    }
}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    try {
        return parse(expression, {
            vars, RenderFragment,
            none: Imports.none(),
            dt: Imports.for(Import.dynamicText)
        });
    }
    catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}` );
    }
}