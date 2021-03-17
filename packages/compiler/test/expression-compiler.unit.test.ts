import {describe, expect, it} from '@jest/globals'
import {Accessor, parseAccessor, parseCondition, parseTextExpression, Variables} from '../lib/expression-compiler'
import {JayNumber, JayObjectType, JayString, JayUnknown} from "../lib/parse-jay-file";

describe('expression-compiler', () => {

    describe('variables', () => {
        it('resolve simple accessor', () => {
            let variables = new Variables(new JayObjectType('data', {name: JayString}));
            expect(variables.resolveAccessor(['name']))
                .toEqual(new Accessor(['name'], [], JayString));
        })

        it('resolve deep accessor', () => {
            let variables = new Variables(new JayObjectType('data', {child: new JayObjectType('child', {name: JayString})}));
            expect(variables.resolveAccessor(['child', 'name']))
                .toEqual(new Accessor(['child', 'name'], [], JayString));
        })

        it('report wrong accessor', () => {
            let variables = new Variables(new JayObjectType('data', {child: new JayObjectType('child', {name: JayString})}));
            expect(variables.resolveAccessor(['child', 'name', 'bla']))
                .toEqual(new Accessor(['child', 'name', 'bla'], ['the data field [child.name.bla] not found in Jay data'], JayUnknown));
        })
    })

    describe('parseCondition', () => {
        let defaultVars = new Variables(new JayObjectType('data', {
            member: JayString
        }));

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

        let defaultVars = new Variables(new JayObjectType('data', {
            string1: JayString
        }))

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

    describe('parseAccessor', () => {
        const object2 = new JayObjectType('bla', {
            num2: JayNumber
        });
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                object2: object2
            }))

        it('parse simple primitive accessor', () => {
            const actual = parseAccessor('string1', defaultVars);
            expect(actual).toEqual(new Accessor(['string1'], [], JayString));
        })

        it('parse simple object accessor', () => {
            const actual = parseAccessor('object2', defaultVars);
            expect(actual).toEqual(new Accessor(['object2'], [], object2));
        })

        it('parse nested primitive accessor', () => {
            const actual = parseAccessor('object2.num2', defaultVars);
            expect(actual).toEqual(new Accessor(['object2', 'num2'], [], JayNumber));
        })

        it('parse wrong accessor', () => {
            const actual = parseAccessor('object2.not_a_member', defaultVars);
            expect(actual).toEqual(new Accessor(['object2', 'not_a_member'],
                ["the data field [object2.not_a_member] not found in Jay data"], JayUnknown));
        })
    })

});
