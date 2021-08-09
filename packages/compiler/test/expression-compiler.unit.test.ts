import {describe, expect, it} from '@jest/globals'
import {
    Accessor,
    parseAccessor,
    parseClassExpression,
    parseCondition,
    parseTextExpression,
    Variables
} from '../lib/expression-compiler'
import {JayBoolean, JayNumber, JayObjectType, JayString, JayUnknown} from "../lib/parse-jay-file";

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

    describe('parseClass', () => {
        let defaultVars = new Variables(new JayObjectType('data', {
            isOne: JayBoolean,
            isTwo: JayBoolean
        }));

        it('one static class declaration', () => {
            const actual = parseClassExpression('class1', defaultVars);
            expect(actual.rendered).toEqual('\'class1\'');
        })

        it('static class declaration', () => {
            const actual = parseClassExpression('class1 class2', defaultVars);
            expect(actual.rendered).toEqual('\'class1 class2\'');
        })

        it('dynamic class declaration', () => {
            const actual = parseClassExpression('{isOne? class1} {isTwo? classTwo} three', defaultVars);
            expect(actual.rendered).toEqual('vs => \`${vs.isOne?\'class1\':\'\'} ${vs.isTwo?\'classTwo\':\'\'} three\`');
        })

        it('one dynamic class declaration', () => {
            const actual = parseClassExpression('{isOne? class1}', defaultVars);
            expect(actual.rendered).toEqual('vs => \`${vs.isOne?\'class1\':\'\'}\`');
        })

        it('dynamic class declaration with fallback', () => {
            const actual = parseClassExpression('{isOne? class1:class2} three', defaultVars);
            expect(actual.rendered).toEqual('vs => \`${vs.isOne?\'class1\':\'class2\'} three\`');
        })
    });

    describe('parseTextExpression', () => {

        let defaultVars = new Variables(new JayObjectType('data', {
            string1: JayString,
            string3: JayString
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
            expect(actual.rendered).toEqual('dt(context, vs => vs.string1)')
        })

        it("single accessor in text", () => {
            const actual = parseTextExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(context, vs => \`some ${vs.string1} thing\`)')
        })

        it("multi accessor in text", () => {
            const actual = parseTextExpression('some {string1} and {string3} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(context, vs => \`some ${vs.string1} and ${vs.string3} thing\`)')
        })

        it("accessor in text not in type renders the type should reports the problem", () => {
            const actual = parseTextExpression('some {string2} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(context, vs => \`some ${vs.string2} thing\`)')
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data'])
        })

        it("accessor in simple text not in type renders the type should reports the problem", () => {
            const actual = parseTextExpression('{string2}', defaultVars);
            expect(actual.rendered).toEqual('dt(context, vs => vs.string2)')
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data'])
        })

        describe('trim whitespace', () => {
            it("trim whitespace to a single space", () => {
                const actual = parseTextExpression('  text  ', defaultVars);
                expect(actual.rendered).toEqual('\' text \'')
            })

            it("trim left whitespace to a single space", () => {
                const actual = parseTextExpression('  text', defaultVars);
                expect(actual.rendered).toEqual('\' text\'')
            })

            it("right left whitespace to a single space", () => {
                const actual = parseTextExpression('text  ', defaultVars);
                expect(actual.rendered).toEqual('\'text \'')
            })

            it("middle whitespace to a single space", () => {
                const actual = parseTextExpression('text     text2', defaultVars);
                expect(actual.rendered).toEqual('\'text text2\'')
            })

            it("left whitespace to template", () => {
                const actual = parseTextExpression('  {string1}', defaultVars);
                expect(actual.rendered).toEqual('dt(context, vs => \` ${vs.string1}\`)')
            })

            it("right whitespace to template", () => {
                const actual = parseTextExpression('{string1}   ', defaultVars);
                expect(actual.rendered).toEqual('dt(context, vs => \`${vs.string1} \`)')
            })

            it("mid whitespace to template", () => {
                const actual = parseTextExpression('{string1}   {string1}', defaultVars);
                expect(actual.rendered).toEqual('dt(context, vs => \`${vs.string1} ${vs.string1}\`)')
            })

            it("middle multiline whitespace to a single space", () => {
                const actual = parseTextExpression('text   \n \t text2', defaultVars);
                expect(actual.rendered).toEqual('\'text text2\'')
            })
        })

        it("use space instead of line break", () => {
            const actual = parseTextExpression('abc\ndef', defaultVars);
            expect(actual.rendered).toEqual('\'abc def\'')
        })

        it("trim all whitespace to a single space", () => {
            const actual = parseTextExpression('  \n\t\r\n  ', defaultVars);
            expect(actual.rendered).toEqual('\' \'')
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
