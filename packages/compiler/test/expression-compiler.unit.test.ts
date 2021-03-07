import {describe, expect, it} from '@jest/globals'
import {parseTextExpression, Variables} from '../lib/expression-compiler'

describe('expression-compiler', () => {

    describe('parseTextExpression', () => {

        let defaultVars = new Variables('vs', {})

        it("constant string expression", () => {
            const actual = parseTextExpression('some constant string', defaultVars).rendered;
            expect(actual).toEqual('some constant string')
        })

        it("constant number expression", () => {
            const actual = parseTextExpression('123123', defaultVars);
            expect(actual.rendered).toEqual('123123')
        })
    });

});
