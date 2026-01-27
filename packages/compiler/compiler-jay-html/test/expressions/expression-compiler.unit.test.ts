import {
    Accessor,
    parseAccessor,
    parseAttributeExpression,
    parseBooleanAttributeExpression,
    parseClassExpression,
    parseComponentPropExpression,
    parseCondition,
    parseConditionForSlowRender,
    parseEnumValues,
    parseImportNames,
    parseIsEnum,
    parsePropertyExpression,
    parseReactClassExpression,
    parseReactTextExpression,
    parseStyleDeclarations,
    parseTextExpression,
    SlowRenderContext,
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
                count: JayNumber,
                nested: new JayObjectType('nested', {
                    page: JayNumber,
                }),
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
            const actual = parseCondition(
                'anEnum == one && member || anEnum == two && !member2',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                'vs => ((vs.anEnum === AnEnum.one) && (vs.member)) || ((vs.anEnum === AnEnum.two) && (!vs.member2))',
            );
        });

        it('parenthesized conditions', () => {
            const actual = parseCondition('(member || member2) && anEnum == one', defaultVars);
            expect(actual.rendered).toEqual(
                'vs => ((vs.member) || (vs.member2)) && (vs.anEnum === AnEnum.one)',
            );
        });

        it('less than comparison with number', () => {
            const actual = parseCondition('count < 10', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count < 10');
        });

        it('less than or equal comparison with number', () => {
            const actual = parseCondition('count <= 1', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count <= 1');
        });

        it('greater than comparison with number', () => {
            const actual = parseCondition('count > 0', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count > 0');
        });

        it('greater than or equal comparison with number', () => {
            const actual = parseCondition('count >= 5', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count >= 5');
        });

        it('nested property comparison with number', () => {
            const actual = parseCondition('nested.page <= 1', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.nested?.page <= 1');
        });

        it('comparison with negative number', () => {
            const actual = parseCondition('count > -5', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count > -5');
        });

        it('comparison with decimal number', () => {
            const actual = parseCondition('count <= 3.14', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count <= 3.14');
        });

        it('comparison combined with boolean condition using AND', () => {
            const actual = parseCondition('count > 0 && member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.count > 0) && (vs.member2)');
        });

        it('comparison combined with enum condition using OR', () => {
            const actual = parseCondition('count <= 1 || anEnum == one', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.count <= 1) || (vs.anEnum === AnEnum.one)');
        });

        it('comparison between two fields', () => {
            const actual = parseCondition('count >= nested.page', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count >= vs.nested?.page');
        });

        it('comparison between nested fields', () => {
            const actual = parseCondition('nested.page <= count', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.nested?.page <= vs.count');
        });

        it('field comparison combined with boolean using AND', () => {
            const actual = parseCondition('count > nested.page && member2', defaultVars);
            expect(actual.rendered).toEqual('vs => (vs.count > vs.nested?.page) && (vs.member2)');
        });

        it('equality comparison with number using ==', () => {
            const actual = parseCondition('count == 0', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count === 0');
        });

        it('equality comparison with number using ===', () => {
            const actual = parseCondition('count === 5', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count === 5');
        });

        it('inequality comparison with number using !=', () => {
            const actual = parseCondition('count != 0', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count !== 0');
        });

        it('inequality comparison with number using !==', () => {
            const actual = parseCondition('count !== 10', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count !== 10');
        });

        it('equality comparison between dotted fields using ==', () => {
            const actual = parseCondition('count == nested.page', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.count === vs.nested?.page');
        });

        it('enum comparison still works with single identifier', () => {
            // Single identifier on right side should be treated as enum value
            const actual = parseCondition('anEnum == one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum === AnEnum.one');
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
                isEnabled: JayBoolean,
                isVisible: JayBoolean,
                nested: new JayObjectType('nested', {
                    isActive: JayBoolean,
                    status: new JayEnumType('Status', ['pending', 'active', 'completed']),
                }),
                currentSort: new JayEnumType('CurrentSort', ['newest', 'oldest', 'priceAsc']),
            }),
        );

        it('simple boolean condition', () => {
            const actual = parseBooleanAttributeExpression('isEnabled', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.isEnabled)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('negated boolean condition', () => {
            const actual = parseBooleanAttributeExpression('!isEnabled', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => !vs.isEnabled)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('nested boolean condition', () => {
            const actual = parseBooleanAttributeExpression('nested.isActive', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.nested?.isActive)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('enum comparison with ==', () => {
            const actual = parseBooleanAttributeExpression('currentSort == newest', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.currentSort === CurrentSort.newest)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('enum comparison with ===', () => {
            const actual = parseBooleanAttributeExpression('currentSort === newest', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.currentSort === CurrentSort.newest)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('enum not equal with !=', () => {
            const actual = parseBooleanAttributeExpression('currentSort != newest', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.currentSort !== CurrentSort.newest)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('nested enum comparison', () => {
            const actual = parseBooleanAttributeExpression('nested.status == active', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => vs.nested?.status === Status.active)');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('logical AND with two booleans', () => {
            const actual = parseBooleanAttributeExpression('isEnabled && isVisible', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => (vs.isEnabled) && (vs.isVisible))');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('logical OR with two booleans', () => {
            const actual = parseBooleanAttributeExpression('isEnabled || isVisible', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => (vs.isEnabled) || (vs.isVisible))');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('logical AND with negation', () => {
            const actual = parseBooleanAttributeExpression('isEnabled && !isVisible', defaultVars);
            expect(actual.rendered).toEqual('ba(vs => (vs.isEnabled) && (!vs.isVisible))');
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('boolean AND enum comparison', () => {
            const actual = parseBooleanAttributeExpression(
                'isEnabled && currentSort == newest',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                'ba(vs => (vs.isEnabled) && (vs.currentSort === CurrentSort.newest))',
            );
            expect(actual.imports.has(Import.booleanAttribute)).toBeTruthy();
        });

        it('complex condition with nested and enum', () => {
            const actual = parseBooleanAttributeExpression(
                'nested.isActive && nested.status == active',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                'ba(vs => (vs.nested?.isActive) && (vs.nested?.status === Status.active))',
            );
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
            }).toThrow(/Failed to parse expression \[some broken \{ expression\]/);
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
            }).toThrow(/Failed to parse expression \[some broken \{ expression\]/);
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
            }).toThrow('Failed to parse expression [name1 name2]');
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
            }).toThrow('Failed to parse expression [enum(not an enum]');
        });
    });

    describe('parseStyleDeclarations', () => {
        let variables: Variables;

        beforeEach(() => {
            variables = new Variables(
                new JayObjectType('data', {
                    color: JayString,
                    width: JayString,
                    fontSize: JayNumber,
                }),
            );
        });

        it('parses fully static styles', () => {
            const result = parseStyleDeclarations('background: red; padding: 10px', variables);
            expect(result.hasDynamic).toBe(false);
            expect(result.declarations).toHaveLength(2);
            expect(result.declarations[0].property).toBe('background');
            expect(result.declarations[0].isDynamic).toBe(false);
            expect(result.declarations[0].valueFragment.rendered).toBe("'red'");
            expect(result.declarations[1].property).toBe('padding');
            expect(result.declarations[1].valueFragment.rendered).toBe("'10px'");
        });

        it('parses fully dynamic styles', () => {
            const result = parseStyleDeclarations('color: {color}; width: {width}', variables);
            expect(result.hasDynamic).toBe(true);
            expect(result.declarations).toHaveLength(2);
            expect(result.declarations[0].property).toBe('color');
            expect(result.declarations[0].isDynamic).toBe(true);
            expect(result.declarations[0].valueFragment.rendered).toContain('dp(vs => vs.color)');
            expect(result.declarations[1].property).toBe('width');
            expect(result.declarations[1].isDynamic).toBe(true);
            expect(result.declarations[1].valueFragment.rendered).toContain('dp(vs => vs.width)');
        });

        it('parses mixed static and dynamic styles', () => {
            const result = parseStyleDeclarations(
                'margin: 10px; color: {color}; padding: 20px',
                variables,
            );
            expect(result.hasDynamic).toBe(true);
            expect(result.declarations).toHaveLength(3);
            expect(result.declarations[0].isDynamic).toBe(false);
            expect(result.declarations[1].isDynamic).toBe(true);
            expect(result.declarations[2].isDynamic).toBe(false);
        });

        it('parses template string values', () => {
            const result = parseStyleDeclarations('font-size: {fontSize}px', variables);
            expect(result.hasDynamic).toBe(true);
            expect(result.declarations[0].valueFragment.rendered).toContain('`${vs.fontSize}px`');
        });

        it('converts kebab-case to camelCase', () => {
            const result = parseStyleDeclarations('background-color: {color}', variables);
            expect(result.declarations[0].property).toBe('backgroundColor');
        });

        it('handles trailing semicolon', () => {
            const result = parseStyleDeclarations('color: red;', variables);
            expect(result.declarations).toHaveLength(1);
            expect(result.declarations[0].property).toBe('color');
        });

        it('handles multiple trailing semicolons', () => {
            const result = parseStyleDeclarations('color: red;;', variables);
            expect(result.declarations).toHaveLength(1);
            expect(result.declarations[0].property).toBe('color');
        });

        it('handles CSS comments', () => {
            const result = parseStyleDeclarations(
                'color: red; /* comment */ background: blue',
                variables,
            );
            expect(result.declarations).toHaveLength(2);
            expect(result.declarations[0].property).toBe('color');
            expect(result.declarations[1].property).toBe('background');
        });

        it('handles complex CSS functions', () => {
            const result = parseStyleDeclarations(
                'background: linear-gradient(rgba(255, 255, 255, 1), rgba(0, 0, 0, 0.5))',
                variables,
            );
            expect(result.declarations).toHaveLength(1);
            expect(result.declarations[0].property).toBe('background');
            expect(result.declarations[0].valueFragment.rendered).toContain('linear-gradient');
        });

        it('handles whitespace variations', () => {
            const result = parseStyleDeclarations('color:red;width:100px', variables);
            expect(result.declarations).toHaveLength(2);
            expect(result.declarations[0].property).toBe('color');
            expect(result.declarations[1].property).toBe('width');
        });

        it('handles empty declarations', () => {
            const result = parseStyleDeclarations('color: red; ; ; background: blue', variables);
            expect(result.declarations).toHaveLength(2);
            expect(result.declarations[0].property).toBe('color');
            expect(result.declarations[1].property).toBe('background');
        });

        it('handles URLs with special characters in quotes', () => {
            const result = parseStyleDeclarations(
                "position: relative;width: 92px;height: 48.89142608642578px;background: url('/images/I2:2069;2:1758_FILL.png') lightgray 50% / cover no-repeat; background-size: ; background-position: ; background-repeat: no-repeat;border-radius: 0px;overflow: hidden;;box-sizing: border-box;",
                variables,
            );
            expect(result.hasDynamic).toBe(false);
            expect(result.declarations.length).toBeGreaterThan(5);
            expect(result.declarations[0].property).toBe('position');
            expect(result.declarations[1].property).toBe('width');
            expect(result.declarations[2].property).toBe('height');
            expect(result.declarations[3].property).toBe('background');
            expect(result.declarations[3].valueFragment.rendered).toContain(
                "url('/images/I2:2069;2:1758_FILL.png')",
            );
        });
    });

    describe('parseConditionForSlowRender', () => {
        // Helper to extract all property paths from an object (for marking as slow)
        function extractPaths(obj: Record<string, unknown>, prefix: string = ''): string[] {
            const paths: string[] = [];
            for (const key of Object.keys(obj)) {
                const path = prefix ? `${prefix}.${key}` : key;
                paths.push(path);
                if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    paths.push(...extractPaths(obj[key] as Record<string, unknown>, path));
                }
            }
            return paths;
        }

        // Helper to create slow context where all properties in slowData are slow-phase
        function allSlowContext(slowData: Record<string, unknown>): SlowRenderContext {
            const phaseMap = new Map<string, { phase: string }>();
            // Mark all properties in slowData as slow
            for (const path of extractPaths(slowData)) {
                phaseMap.set(path, { phase: 'slow' });
            }
            return {
                slowData,
                phaseMap,
                contextPath: '',
            };
        }

        // Helper to create slow context with explicit phase map
        function mixedPhaseContext(
            slowData: Record<string, unknown>,
            slowPaths: string[],
            fastPaths: string[],
        ): SlowRenderContext {
            const phaseMap = new Map<string, { phase: string }>();
            for (const path of slowPaths) {
                phaseMap.set(path, { phase: 'slow' });
            }
            for (const path of fastPaths) {
                phaseMap.set(path, { phase: 'fast' });
            }
            return {
                slowData,
                phaseMap,
                contextPath: '',
            };
        }

        describe('fully slow conditions', () => {
            it('should resolve simple property to true when truthy', () => {
                const result = parseConditionForSlowRender(
                    'isActive',
                    allSlowContext({ isActive: true }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve simple property to false when falsy', () => {
                const result = parseConditionForSlowRender(
                    'isActive',
                    allSlowContext({ isActive: false }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should resolve empty string as falsy', () => {
                const result = parseConditionForSlowRender(
                    'imageUrl',
                    allSlowContext({ imageUrl: '' }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should resolve non-empty string as truthy', () => {
                const result = parseConditionForSlowRender(
                    'imageUrl',
                    allSlowContext({ imageUrl: 'http://example.com/img.jpg' }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve negation correctly', () => {
                const result = parseConditionForSlowRender(
                    '!imageUrl',
                    allSlowContext({ imageUrl: '' }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve double negation correctly', () => {
                const result = parseConditionForSlowRender(
                    '!!imageUrl',
                    allSlowContext({ imageUrl: 'http://example.com' }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve nested property access', () => {
                const result = parseConditionForSlowRender(
                    'product.isAvailable',
                    allSlowContext({ product: { isAvailable: true } }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve numeric comparison greater than', () => {
                const result = parseConditionForSlowRender(
                    'count > 0',
                    allSlowContext({ count: 5 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve numeric comparison less than or equal', () => {
                const result = parseConditionForSlowRender(
                    'count <= 0',
                    allSlowContext({ count: 0 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve equality comparison', () => {
                const result = parseConditionForSlowRender(
                    'status == 5',
                    allSlowContext({ status: 5 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve false equality comparison', () => {
                const result = parseConditionForSlowRender(
                    'status == 5',
                    allSlowContext({ status: 4 }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should resolve inequality comparison', () => {
                const result = parseConditionForSlowRender(
                    'status != 0',
                    allSlowContext({ status: 5 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve logical AND with both true', () => {
                const result = parseConditionForSlowRender(
                    'inStock && isAvailable',
                    allSlowContext({ inStock: true, isAvailable: true }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve logical AND with one false', () => {
                const result = parseConditionForSlowRender(
                    'inStock && isAvailable',
                    allSlowContext({ inStock: true, isAvailable: false }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should resolve logical OR with one true', () => {
                const result = parseConditionForSlowRender(
                    'isPromoted || hasDiscount',
                    allSlowContext({ isPromoted: false, hasDiscount: true }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve logical OR with both false', () => {
                const result = parseConditionForSlowRender(
                    'isPromoted || hasDiscount',
                    allSlowContext({ isPromoted: false, hasDiscount: false }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should resolve parenthesized expressions', () => {
                const result = parseConditionForSlowRender(
                    '(a && b) || c',
                    allSlowContext({ a: true, b: false, c: true }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should resolve complex expression', () => {
                const result = parseConditionForSlowRender(
                    '!imageUrl && count > 0',
                    allSlowContext({ imageUrl: '', count: 5 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });
        });

        describe('mixed phase conditions', () => {
            it('should simplify true && X to X', () => {
                const ctx = mixedPhaseContext({ inStock: true }, ['inStock'], ['price']);
                const result = parseConditionForSlowRender('inStock && price > 0', ctx);
                expect(result.type).toEqual('runtime');
                if (result.type === 'runtime') {
                    expect(result.simplifiedExpr).toEqual('price > 0');
                }
            });

            it('should simplify false && X to false', () => {
                const ctx = mixedPhaseContext({ inStock: false }, ['inStock'], ['price']);
                const result = parseConditionForSlowRender('inStock && price > 0', ctx);
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should simplify true || X to true', () => {
                const ctx = mixedPhaseContext(
                    { isPromoted: true },
                    ['isPromoted'],
                    ['hasDiscount'],
                );
                const result = parseConditionForSlowRender('isPromoted || hasDiscount', ctx);
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should simplify false || X to X', () => {
                const ctx = mixedPhaseContext(
                    { isPromoted: false },
                    ['isPromoted'],
                    ['hasDiscount'],
                );
                const result = parseConditionForSlowRender('isPromoted || hasDiscount', ctx);
                expect(result.type).toEqual('runtime');
                if (result.type === 'runtime') {
                    expect(result.simplifiedExpr).toEqual('hasDiscount');
                }
            });

            it('should handle X && true as X', () => {
                const ctx = mixedPhaseContext({ inStock: true }, ['inStock'], ['price']);
                const result = parseConditionForSlowRender('price > 0 && inStock', ctx);
                expect(result.type).toEqual('runtime');
                if (result.type === 'runtime') {
                    expect(result.simplifiedExpr).toEqual('price > 0');
                }
            });

            it('should handle X && false as false', () => {
                const ctx = mixedPhaseContext({ inStock: false }, ['inStock'], ['price']);
                const result = parseConditionForSlowRender('price > 0 && inStock', ctx);
                expect(result).toEqual({ type: 'resolved', value: false });
            });
        });

        describe('fully runtime conditions', () => {
            it('should return runtime code for fast-phase properties', () => {
                const ctx = mixedPhaseContext({}, [], ['isActive']);
                const result = parseConditionForSlowRender('isActive', ctx);
                expect(result.type).toEqual('runtime');
                if (result.type === 'runtime') {
                    expect(result.code.rendered).toContain('isActive');
                }
            });

            it('should return runtime code for complex fast expressions', () => {
                const ctx = mixedPhaseContext({}, [], ['count', 'limit']);
                const result = parseConditionForSlowRender('count > limit', ctx);
                expect(result.type).toEqual('runtime');
                if (result.type === 'runtime') {
                    expect(result.code.rendered).toContain('count');
                    expect(result.code.rendered).toContain('limit');
                }
            });
        });

        describe('edge cases', () => {
            it('should handle zero as falsy', () => {
                const result = parseConditionForSlowRender('count', allSlowContext({ count: 0 }));
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should handle undefined as falsy', () => {
                // Property 'missing' must be explicitly marked as slow to be evaluated
                const result = parseConditionForSlowRender(
                    'missing',
                    mixedPhaseContext({}, ['missing'], []),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should handle null as falsy', () => {
                const result = parseConditionForSlowRender(
                    'value',
                    allSlowContext({ value: null }),
                );
                expect(result).toEqual({ type: 'resolved', value: false });
            });

            it('should handle boolean literals', () => {
                const resultTrue = parseConditionForSlowRender('true', allSlowContext({}));
                expect(resultTrue).toEqual({ type: 'resolved', value: true });

                const resultFalse = parseConditionForSlowRender('false', allSlowContext({}));
                expect(resultFalse).toEqual({ type: 'resolved', value: false });
            });

            it('should handle negative numbers in comparisons', () => {
                const result = parseConditionForSlowRender(
                    'count > -1',
                    allSlowContext({ count: 0 }),
                );
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should handle context path for nested properties', () => {
                const ctx: SlowRenderContext = {
                    slowData: { imageUrl: '' },
                    phaseMap: new Map([['products.imageUrl', { phase: 'slow' }]]),
                    contextPath: 'products',
                };
                const result = parseConditionForSlowRender('!imageUrl', ctx);
                expect(result).toEqual({ type: 'resolved', value: true });
            });

            it('should NOT evaluate properties not in phase map (e.g., headless component properties)', () => {
                // This tests the fix for the bug where productSearch.hasResults from a headless
                // component was being evaluated even though it's not in the page's phase map
                const ctx: SlowRenderContext = {
                    slowData: { someSlowProp: true },
                    phaseMap: new Map([['someSlowProp', { phase: 'slow' }]]),
                    // productSearch.hasResults is NOT in the phase map
                    contextPath: '',
                };
                const result = parseConditionForSlowRender('productSearch.hasResults', ctx);
                // Should NOT be resolved - should return runtime code
                expect(result.type).toEqual('runtime');
            });

            it('should NOT evaluate unknown properties even with data present', () => {
                // Even if there's data for a property, if it's not in the phase map, don't evaluate
                const ctx: SlowRenderContext = {
                    slowData: { unknownProp: true },
                    phaseMap: new Map(), // Empty phase map = nothing is marked as slow
                    contextPath: '',
                };
                const result = parseConditionForSlowRender('unknownProp', ctx);
                expect(result.type).toEqual('runtime');
            });
        });
    });
});
