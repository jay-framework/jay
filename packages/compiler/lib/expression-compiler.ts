import {Imports, RenderFragment} from './render-fragment';
import {parse} from '../lib/parse-expressions'

export interface ObjectOfStrings {
    [key: string]:string;
}

export class Variables {
    private readonly defaultVar: string;
    private readonly vars: ObjectOfStrings;
    constructor(defaultVar: string, vars: ObjectOfStrings) {
        this.defaultVar = defaultVar;
        this.vars = vars;
    }
}

export function parseAccessor(expression: string, vars: Variables): RenderFragment {

}

export function parseCondition(expression: string, vars: Variables): RenderFragment {

}

export function parseTextExpression(expression: string, vars: Variables): RenderFragment {
    try {
        return new RenderFragment(parse(expression), Imports.none());
    }
    catch (e) {
        throw new Error(`failed to parse expression [${expression}]. ${e.message}` );
    }
}