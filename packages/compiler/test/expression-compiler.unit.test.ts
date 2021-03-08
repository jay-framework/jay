import {describe, expect, it} from '@jest/globals'
import {parseTextExpression, Variables} from '../lib/expression-compiler'

describe('expression-compiler', () => {

    describe('parseTextExpression', () => {

        let defaultVars = new Variables('viewState', {})

        it("constant string expression", () => {
            const actual = parseTextExpression('some constant string', defaultVars).rendered;
            expect(actual).toEqual('\'some constant string\'')
        })

        it("constant number expression", () => {
            const actual = parseTextExpression('123123', defaultVars);
            expect(actual.rendered).toEqual('\'123123\'')
        })

        it("single accessor", () => {
            const actual = parseTextExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('dt(viewState, vs => vs.string1)')
        })

        it("single accessor in text", () => {
            const actual = parseTextExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(viewState, vs => \`some ${vs.string1} thing\`)')
        })

        it("fail and report broken expression", () => {
            const actual =
            expect(() => {
                parseTextExpression('some broken { expression', defaultVars);
            }).toThrow('failed to parse expression [some broken { expression]. ')
        })
    });

});
