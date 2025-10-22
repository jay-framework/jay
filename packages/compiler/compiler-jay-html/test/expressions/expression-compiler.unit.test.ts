import {
    Accessor,
    parseAccessor,
    parseAttributeExpression,
    parseBooleanAttributeExpression,
    parseClassExpression,
    parseComponentPropExpression,
    parseCondition,
    parseEnumValues,
    parseImportNames,
    parseIsEnum,
    parsePropertyExpression,
    parseReactClassExpression,
    parseReactTextExpression,
    parseTextExpression,
    Variables,
} from '../../lib/expressions/expression-compiler';

import { Import } from '@jay-framework/compiler-shared';
import {
    JayBoolean,
    JayEnumType,
    JayImportedType,
    JayNumber,
    JayObjectType,
    JayString,
    JayUnknown,
} from '@jay-framework/compiler-shared';

describe('expression-compiler', () => {
    describe('variables', () => {
        it('resolve simple accessor', () => {
            let variables = new Variables(new JayObjectType('data', { name: JayString }));
            expect(variables.resolveAccessor(['name'])).toEqual(
                new Accessor('vs', ['name'], [], JayString),
            );
        });

        it('resolve deep accessor', () => {
            let variables = new Variables(
                new JayObjectType('data', {
                    child: new JayObjectType('child', { name: JayString }),
                }),
            );
            expect(variables.resolveAccessor(['child', 'name'])).toEqual(
                new Accessor('vs', ['child', 'name'], [], JayString),
            );
        });

        it('report wrong accessor', () => {
            let variables = new Variables(
                new JayObjectType('data', {
                    child: new JayObjectType('child', { name: JayString }),
                }),
            );
            expect(variables.resolveAccessor(['child', 'name', 'bla'])).toEqual(
                new Accessor(
                    'vs',
                    ['child', 'name', 'bla'],
                    ['the data field [child.name.bla] not found in Jay data'],
                    JayUnknown,
                ),
            );
        });
    });

    describe('parseCondition', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                member: JayString,
                member2: JayBoolean,
                anEnum: new JayEnumType('AnEnum', ['one', 'two', 'three']),
            }),
        );

        it('basic condition', () => {
            const actual = parseCondition('member', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.member');
        });

        it('not condition', () => {
            const actual = parseCondition('!member', defaultVars);
            expect(actual.rendered).toEqual('vs => !vs.member');
        });

        it('enum condition with ==', () => {
            const actual = parseCondition('anEnum == one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum === AnEnum.one');
        });

        it('enum condition with ===', () => {
            const actual = parseCondition('anEnum === one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum === AnEnum.one');
        });

        it('enum not condition with !=', () => {
            const actual = parseCondition('anEnum != one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum !== AnEnum.one');
        });

        it('enum not condition with !==', () => {
            const actual = parseCondition('anEnum !== one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum !== AnEnum.one');
        });

        it('logical AND with two boolean conditions', () => {
            const actual = parseCondition('member && member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.member) && (vs.member2)');
        });

        it('logical OR with two boolean conditions', () => {
            const actual = parseCondition('member || member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.member) || (vs.member2)');
        });

        it('logical AND with negated conditions', () => {
            const actual = parseCondition('!member && member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (!vs.member) && (vs.member2)');
        });

        it('logical OR with negated conditions', () => {
            const actual = parseCondition('!member || !member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (!vs.member) || (!vs.member2)');
        });

        it('mixed AND and OR with proper precedence', () => {
            const actual = parseCondition('member && member2 || !member', defaultVars);
            expect(actual.rendered).toEqual('vs => ((vs.member) && (vs.member2)) || (!vs.member)');
        });

        it('logical AND with enum and boolean', () => {
            const actual = parseCondition('anEnum == one && member', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.anEnum === AnEnum.one) && (vs.member)');
        });

        it('logical OR with enum and boolean', () => {
            const actual = parseCondition('anEnum != one || member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.anEnum !== AnEnum.one) || (vs.member2)');
        });

        it('complex condition with enums and booleans', () => {
            const actual = parseCondition('anEnum == one && member || anEnum == two && !member2', defaultVars);
            expect(actual.rendered).toEqual('vs => ((vs.anEnum === AnEnum.one) && (vs.member)) || ((vs.anEnum === AnEnum.two) && (!vs.member2))');
        });

        it('parenthesized conditions', () => {
            const actual = parseCondition('(member || member2) && anEnum == one', defaultVars);
            expect(actual.rendered).toEqual('vs => ((vs.member) || (vs.member2)) && (vs.anEnum === AnEnum.one)');
        });

        it('basic condition with member not in type should report a problem', () => {
            const actual = parseCondition('notAMember', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.notAMember');
            expect(actual.validations).toEqual([
                'the data field [notAMember] not found in Jay data',
            ]);
        });
    });

    describe('parseClass', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                isOne: JayBoolean,
                isTwo: JayBoolean,
                anEnum: new JayEnumType('AnEnum', ['one', 'two', 'three']),
            }),
        );

        it('one static class declaration', () => {
            const actual = parseClassExpression('class1', defaultVars);
            expect(actual.rendered).toEqual("'class1'");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeFalsy();
        });

        it('static class declaration', () => {
            const actual = parseClassExpression('class1 class2', defaultVars);
            expect(actual.rendered).toEqual("'class1 class2'");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeFalsy();
        });

        it('class as value from view state', () => {
            const actual = parseClassExpression('{classProperty}', defaultVars);
            expect(actual.rendered).toEqual('da(vs => `${vs.classProperty}`)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration', () => {
            const actual = parseClassExpression(
                '{isOne? class1} {isTwo? classTwo} three',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                "da(vs => `${vs.isOne?'class1':''} ${vs.isTwo?'classTwo':''} three`)",
            );
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('one dynamic class declaration', () => {
            const actual = parseClassExpression('{isOne? class1}', defaultVars);
            expect(actual.rendered).toEqual("da(vs => `${vs.isOne?'class1':''}`)");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration with enum', () => {
            const actual = parseClassExpression('{anEnum == one? class1}', defaultVars);
            expect(actual.rendered).toEqual("da(vs => `${vs.anEnum === AnEnum.one?'class1':''}`)");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration with fallback', () => {
            const actual = parseClassExpression('{isOne? class1:class2} three', defaultVars);
            expect(actual.rendered).toEqual("da(vs => `${vs.isOne?'class1':'class2'} three`)");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });
    });

    describe('parseReactClass', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                isOne: JayBoolean,
                isTwo: JayBoolean,
                anEnum: new JayEnumType('AnEnum', ['one', 'two', 'three']),
            }),
        );

        it('one static class declaration', () => {
            const actual = parseReactClassExpression('class1', defaultVars);
            expect(actual.rendered).toEqual('"class1"');
        });

        it('static class declaration', () => {
            const actual = parseReactClassExpression('class1 class2', defaultVars);
            expect(actual.rendered).toEqual('"class1 class2"');
        });

        it('class as value from view state', () => {
            const actual = parseReactClassExpression('{classProperty}', defaultVars);
            expect(actual.rendered).toEqual('{vs.classProperty}');
        });

        it('dynamic class declaration', () => {
            const actual = parseReactClassExpression(
                '{isOne? class1} {isTwo? classTwo} three',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                "{`${vs.isOne?'class1':''} ${vs.isTwo?'classTwo':''} three`}",
            );
        });

        it('one dynamic class declaration', () => {
            const actual = parseReactClassExpression('{isOne? class1}', defaultVars);
            expect(actual.rendered).toEqual("{vs.isOne?'class1':''}");
        });

        it('dynamic class declaration with enum', () => {
            const actual = parseReactClassExpression('{anEnum == one? class1}', defaultVars);
            expect(actual.rendered).toEqual("{vs.anEnum === AnEnum.one?'class1':''}");
        });

        it('dynamic class declaration with fallback', () => {
            const actual = parseReactClassExpression('{isOne? class1:class2} three', defaultVars);
            expect(actual.rendered).toEqual("{`${vs.isOne?'class1':'class2'} three`}");
        });
    });

    describe('parseAttributeExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parseAttributeExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual("'some constant string'");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeFalsy();
        });

        it('constant number expression', () => {
            const actual = parseAttributeExpression('123123', defaultVars);
            expect(actual.rendered).toEqual("'123123'");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeFalsy();
        });

        it('single accessor', () => {
            const actual = parseAttributeExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('da(vs => vs.string1)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('single accessor in text', () => {
            const actual = parseAttributeExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('da(vs => `some ${vs.string1} thing`)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('single accessor with text before', () => {
            const actual = parseAttributeExpression('some {string1}', defaultVars);
            expect(actual.rendered).toEqual('da(vs => `some ${vs.string1}`)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('single accessor with text after', () => {
            const actual = parseAttributeExpression('{string1} thing', defaultVars);
            expect(actual.rendered).toEqual('da(vs => `${vs.string1} thing`)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });
    });

    describe('parseBooleanAttributeExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parseBooleanAttributeExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual("'some constant string'");
            expect(actual.imports.has(Import.booleanAttribute)).toBeFalsy();
        });

        it('constant number expression', () => {
            const actual = parseBooleanAttributeExpression('123123', defaultVars);
            expect(actual.rendered).toEqual("'123123'");
            expect(actual.imports.has(Import.booleanAttribute)).toBeFalsy();
        });

        it('single accessor', () => {
            const actual = parseBooleanAttributeExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.string1)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('single accessor in text', () => {
            const actual = parseBooleanAttributeExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => `some ${vs.string1} thing`)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('single accessor with text before', () => {
            const actual = parseBooleanAttributeExpression('some {string1}', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => `some ${vs.string1}`)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('single accessor with text after', () => {
            const actual = parseBooleanAttributeExpression('{string1} thing', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => `${vs.string1} thing`)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });
    });

    describe('parsePropertyExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parsePropertyExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual("'some constant string'");
            expect(actual.imports.has(Import.dynamicProperty)).toBeFalsy();
        });

        it('constant number expression', () => {
            const actual = parsePropertyExpression('123123', defaultVars);
            expect(actual.rendered).toEqual("'123123'");
            expect(actual.imports.has(Import.dynamicProperty)).toBeFalsy();
        });

        it('single accessor', () => {
            const actual = parsePropertyExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('dp(vs => vs.string1)');
            expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy();
        });

        it('single accessor in text', () => {
            const actual = parsePropertyExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('dp(vs => `some ${vs.string1} thing`)');
            expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy();
        });

        it('parse {.} (the self accessor)', () => {
            const actual = parsePropertyExpression('{.}', defaultVars);
            expect(actual.rendered).toEqual('dp(vs => vs)');
            expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy();
        });
    });

    describe('parseComponentPropExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parseComponentPropExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual("'some constant string'");
            expect(actual.imports.has(Import.dynamicProperty)).toBeFalsy();
        });

        it('constant number expression', () => {
            const actual = parseComponentPropExpression('123123', defaultVars);
            expect(actual.rendered).toEqual('123123');
            expect(actual.imports.has(Import.dynamicProperty)).toBeFalsy();
        });

        // it("single accessor", () => {
        //     const actual = parseComponentPropExpression('{string1}', defaultVars);
        //     expect(actual.rendered).toEqual('dp(vs => vs.string1)')
        //     expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy()
        // })
        //
        // it("single accessor in text", () => {
        //     const actual = parseComponentPropExpression('some {string1} thing', defaultVars);
        //     expect(actual.rendered).toEqual('dp(vs => \`some ${vs.string1} thing\`)')
        //     expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy()
        // })
        //
        // it("parse {.} (the self accessor)", () => {
        //     const actual = parseComponentPropExpression('{.}', defaultVars);
        //     expect(actual.rendered).toEqual('dp(vs => vs)')
        //     expect(actual.imports.has(Import.dynamicProperty)).toBeTruthy()
        // })
    });

    describe('parseTextExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parseTextExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual("'some constant string'");
            expect(actual.imports.has(Import.dynamicText)).toBeFalsy();
        });

        it('constant number expression', () => {
            const actual = parseTextExpression('123123', defaultVars);
            expect(actual.rendered).toEqual("'123123'");
            expect(actual.imports.has(Import.dynamicText)).toBeFalsy();
        });

        it('single accessor', () => {
            const actual = parseTextExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('dt(vs => vs.string1)');
            expect(actual.imports.has(Import.dynamicText)).toBeTruthy();
        });

        it('single accessor in text', () => {
            const actual = parseTextExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(vs => `some ${vs.string1} thing`)');
            expect(actual.imports.has(Import.dynamicText)).toBeTruthy();
        });

        it('multi accessor in text', () => {
            const actual = parseTextExpression('some {string1} and {string3} thing', defaultVars);
            expect(actual.rendered).toEqual(
                'dt(vs => `some ${vs.string1} and ${vs.string3} thing`)',
            );
            expect(actual.imports.has(Import.dynamicText)).toBeTruthy();
        });

        it('accessor in text not in type renders the type should reports the problem', () => {
            const actual = parseTextExpression('some {string2} thing', defaultVars);
            expect(actual.rendered).toEqual('dt(vs => `some ${vs.string2} thing`)');
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data']);
        });

        it('accessor in simple text not in type renders the type should reports the problem', () => {
            const actual = parseTextExpression('{string2}', defaultVars);
            expect(actual.rendered).toEqual('dt(vs => vs.string2)');
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data']);
        });

        describe('trim whitespace', () => {
            it('trim whitespace to a single space', () => {
                const actual = parseTextExpression('  text  ', defaultVars);
                expect(actual.rendered).toEqual("' text '");
            });

            it('trim left whitespace to a single space', () => {
                const actual = parseTextExpression('  text', defaultVars);
                expect(actual.rendered).toEqual("' text'");
            });

            it('right left whitespace to a single space', () => {
                const actual = parseTextExpression('text  ', defaultVars);
                expect(actual.rendered).toEqual("'text '");
            });

            it('middle whitespace to a single space', () => {
                const actual = parseTextExpression('text     text2', defaultVars);
                expect(actual.rendered).toEqual("'text text2'");
            });

            it('left whitespace to template', () => {
                const actual = parseTextExpression('  {string1}', defaultVars);
                expect(actual.rendered).toEqual('dt(vs => ` ${vs.string1}`)');
            });

            it('right whitespace to template', () => {
                const actual = parseTextExpression('{string1}   ', defaultVars);
                expect(actual.rendered).toEqual('dt(vs => `${vs.string1} `)');
            });

            it('mid whitespace to template', () => {
                const actual = parseTextExpression('{string1}   {string1}', defaultVars);
                expect(actual.rendered).toEqual('dt(vs => `${vs.string1} ${vs.string1}`)');
            });

            it('middle multiline whitespace to a single space', () => {
                const actual = parseTextExpression('text   \n \t text2', defaultVars);
                expect(actual.rendered).toEqual("'text text2'");
            });
        });

        it('use space instead of line break', () => {
            const actual = parseTextExpression('abc\ndef', defaultVars);
            expect(actual.rendered).toEqual("'abc def'");
        });

        it('trim all whitespace to a single space', () => {
            const actual = parseTextExpression('  \n\t\r\n  ', defaultVars);
            expect(actual.rendered).toEqual("' '");
        });

        it('fail and report broken expression', () => {
            expect(() => {
                parseTextExpression('some broken { expression', defaultVars);
            }).toThrow('failed to parse expression [some broken { expression]. ');
        });
    });

    describe('parseReactTextExpression', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                string1: JayString,
                string3: JayString,
            }),
        );

        it('constant string expression', () => {
            const actual = parseReactTextExpression('some constant string', defaultVars);
            expect(actual.rendered).toEqual('some constant string');
        });

        it('constant number expression', () => {
            const actual = parseReactTextExpression('123123', defaultVars);
            expect(actual.rendered).toEqual('123123');
        });

        it('single accessor', () => {
            const actual = parseReactTextExpression('{string1}', defaultVars);
            expect(actual.rendered).toEqual('{vs.string1}');
        });

        it('single accessor in text', () => {
            const actual = parseReactTextExpression('some {string1} thing', defaultVars);
            expect(actual.rendered).toEqual('some {vs.string1} thing');
        });

        it('multi accessor in text', () => {
            const actual = parseReactTextExpression(
                'some {string1} and {string3} thing',
                defaultVars,
            );
            expect(actual.rendered).toEqual('some {vs.string1} and {vs.string3} thing');
        });

        it('accessor in text not in type renders the type should reports the problem', () => {
            const actual = parseReactTextExpression('some {string2} thing', defaultVars);
            expect(actual.rendered).toEqual('some {vs.string2} thing');
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data']);
        });

        it('accessor in simple text not in type renders the type should reports the problem', () => {
            const actual = parseReactTextExpression('{string2}', defaultVars);
            expect(actual.rendered).toEqual('{vs.string2}');
            expect(actual.validations).toEqual(['the data field [string2] not found in Jay data']);
        });

        describe('trim whitespace', () => {
            it('trim whitespace to a single space', () => {
                const actual = parseReactTextExpression('  text  ', defaultVars);
                expect(actual.rendered).toEqual(' text ');
            });

            it('trim left whitespace to a single space', () => {
                const actual = parseReactTextExpression('  text', defaultVars);
                expect(actual.rendered).toEqual(' text');
            });

            it('right left whitespace to a single space', () => {
                const actual = parseReactTextExpression('text  ', defaultVars);
                expect(actual.rendered).toEqual('text ');
            });

            it('middle whitespace to a single space', () => {
                const actual = parseReactTextExpression('text     text2', defaultVars);
                expect(actual.rendered).toEqual('text text2');
            });

            it('left whitespace to template', () => {
                const actual = parseReactTextExpression('  {string1}', defaultVars);
                expect(actual.rendered).toEqual(' {vs.string1}');
            });

            it('right whitespace to template', () => {
                const actual = parseReactTextExpression('{string1}   ', defaultVars);
                expect(actual.rendered).toEqual('{vs.string1} ');
            });

            it('mid whitespace to template', () => {
                const actual = parseReactTextExpression('{string1}   {string1}', defaultVars);
                expect(actual.rendered).toEqual('{vs.string1} {vs.string1}');
            });

            it('middle multiline whitespace to a single space', () => {
                const actual = parseReactTextExpression('text   \n \t text2', defaultVars);
                expect(actual.rendered).toEqual('text text2');
            });
        });

        it('use space instead of line break', () => {
            const actual = parseReactTextExpression('abc\ndef', defaultVars);
            expect(actual.rendered).toEqual('abc def');
        });

        it('trim all whitespace to a single space', () => {
            const actual = parseReactTextExpression('  \n\t\r\n  ', defaultVars);
            expect(actual.rendered).toEqual(' ');
        });

        it('fail and report broken expression', () => {
            expect(() => {
                parseReactTextExpression('some broken { expression', defaultVars);
            }).toThrow('failed to parse expression [some broken { expression]. ');
        });
    });

    describe('parseAccessor', () => {
        const object2 = new JayObjectType('bla', {
            num2: JayNumber,
        });
        const object1 = new JayObjectType('data', {
            string1: JayString,
            object2: object2,
        });
        let defaultVars = new Variables(object1);

        it('parse simple primitive accessor', () => {
            const actual = parseAccessor('string1', defaultVars);
            expect(actual).toEqual(new Accessor('vs', ['string1'], [], JayString));
        });

        it('parse simple object accessor', () => {
            const actual = parseAccessor('object2', defaultVars);
            expect(actual).toEqual(new Accessor('vs', ['object2'], [], object2));
        });

        it('parse nested primitive accessor', () => {
            const actual = parseAccessor('object2.num2', defaultVars);
            expect(actual).toEqual(new Accessor('vs', ['object2', 'num2'], [], JayNumber));
        });

        it('parse self accessor', () => {
            const actual = parseAccessor('.', defaultVars);
            expect(actual).toEqual(new Accessor('vs', ['.'], [], object1));
        });

        it('parse top level imported type', () => {
            const variables = new Variables(
                new JayImportedType(
                    'root',
                    new JayObjectType('obj1', {
                        bla: JayString,
                    }),
                ),
            );
            const actual = parseAccessor('bla', variables);
            expect(actual).toEqual(new Accessor('vs', ['bla'], [], JayString));
        });

        it('parse nested imported type', () => {
            const variables = new Variables(
                new JayObjectType('root', {
                    prop1: new JayImportedType(
                        'root',
                        new JayObjectType('obj1', {
                            bla: JayString,
                        }),
                    ),
                }),
            );
            const actual = parseAccessor('prop1.bla', variables);
            expect(actual).toEqual(new Accessor('vs', ['prop1', 'bla'], [], JayString));
        });

        it('parse wrong accessor', () => {
            const actual = parseAccessor('object2.not_a_member', defaultVars);
            expect(actual).toEqual(
                new Accessor(
                    'vs',
                    ['object2', 'not_a_member'],
                    ['the data field [object2.not_a_member] not found in Jay data'],
                    JayUnknown,
                ),
            );
        });
    });

    describe('parseImportNames', () => {
        it('parse simple importName', () => {
            const actual = parseImportNames('aName');
            expect(actual).toEqual([{ name: 'aName' }]);
        });

        it('parse import rename', () => {
            const actual = parseImportNames('name1 as name2');
            expect(actual).toEqual([{ name: 'name1', as: 'name2' }]);
        });

        it('parse multiple names', () => {
            const actual = parseImportNames('name1, name2');
            expect(actual).toEqual([{ name: 'name1' }, { name: 'name2' }]);
        });

        it('parse multiple names and renames', () => {
            const actual = parseImportNames('name1 as name11, name2 as name22, name3');
            expect(actual).toEqual([
                { name: 'name1', as: 'name11' },
                { name: 'name2', as: 'name22' },
                { name: 'name3' },
            ]);
        });

        it('invalid import names', () => {
            expect(() => {
                parseImportNames('name1 name2');
            }).toThrow(
                'failed to parse expression [name1 name2]. Expected "," or "as" but "n" found.',
            );
        });
    });

    describe('parseEnum', () => {
        it('parses the values of an enum type', () => {
            const actual = parseEnumValues('enum(one | two | three)');
            expect(actual).toEqual(['one', 'two', 'three']);
        });

        it('parses is enum', () => {
            const actual = parseIsEnum('enum(one | two | three)');
            expect(actual).toEqual(true);
        });

        it('parses is enum for non enums', () => {
            const actual = parseIsEnum('not an enum');
            expect(actual).toEqual(false);
        });

        it('parses invalid enum', () => {
            expect(() => {
                parseEnumValues('enum(not an enum');
            }).toThrow(
                'failed to parse expression [enum(not an enum]. Expected ")" or "|" but "a" found.',
            );
        });
    });
});
