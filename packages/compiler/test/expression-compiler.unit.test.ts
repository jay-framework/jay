import {describe, expect, it} from '@jest/globals'
import {parseCondition, parseTextExpression, Variables} from '../lib/expression-compiler'
import {JayPrimitiveTypes} from "../lib/parse-jay-file";

describe('expression-compiler', () => {

    describe('parseCondition', () => {
        let defaultVars = new Variables('viewState', {
            member: JayPrimitiveTypes.type_string
        })

        it('basic condition', () => {
            const actual = parseCondition('member', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.member');
        })

        it('not condition', () => {
            const actual = parseCondition('!member', defaultVars);
            expect(actual.rendered).toEqual('vs => !vs.member');
        })

        it('basic condition with member not in type should report a problem', () => {
            const actual = parseCondition('notAMember', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.notAMember');
            expect(actual.validations).toEqual(['the data field [notAMember] not found in Jay data'])
        })
    })

    describe('parseTextExpression', () => {

        let defaultVars = new Variables('viewState', {
            string1: JayPrimitiveTypes.type_string
        })

        it("constant string expression", () => {
            const actual = parseTextExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual('\'some constant string\'')
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

        it("accessor in text not in type renders the type should reports the problem", () => {
            const actual = parseTextExpression('some {string2} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(viewState, vs => \`some ${vs.string2} thing\`)')
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data'])
        })

        it("accessor in simple text not in type renders the type should reports the problem", () => {
            const actual = parseTextExpression('{string2}', defaultVars);
            expect(actual.rendered).toEqual('dt(viewState, vs => vs.string2)')
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data'])
        })

        it("fail and report broken expression", () => {
            expect(() => {
                parseTextExpression('some broken { expression', defaultVars);
            }).toThrow('failed to parse expression [some broken { expression]. ')
        })
    });

});
