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
    parseTemplateParts,
    parseTextExpression,
    SlowRenderContext,
    Variables,
} from '../../lib/expressions/expression-compiler';

import { Import } from '@jay-framework/compiler-shared';
import {
    JayArrayType,
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

    // DL#193 Capability A — `$parent` climbs to an enclosing scope for reactive
    // text/attribute bindings inside forEach / withData scopes.
    describe('$parent parent-scope access (DL#193)', () => {
        const listVars = new Variables(
            new JayObjectType('data', {
                listTitle: JayString,
                items: new JayArrayType(
                    new JayObjectType('Item', { name: JayString, id: JayString }),
                ),
            }),
        );
        const itemVars = listVars.childVariableFor(listVars.resolveAccessor(['items']));

        const gridVars = new Variables(
            new JayObjectType('data', {
                title: JayString,
                rows: new JayArrayType(
                    new JayObjectType('Row', {
                        id: JayString,
                        cells: new JayArrayType(
                            new JayObjectType('Cell', { id: JayString, label: JayString }),
                        ),
                    }),
                ),
            }),
        );
        const rowVars = gridVars.childVariableFor(gridVars.resolveAccessor(['rows']));
        const cellVars = rowVars.childVariableFor(rowVars.resolveAccessor(['cells']));

        describe('resolveAccessor', () => {
            it('resolves $parent.field to the parent type with parentLevel 1', () => {
                expect(itemVars.resolveAccessor(['$parent', 'listTitle'])).toEqual(
                    new Accessor('vs', ['listTitle'], [], JayString, 1),
                );
            });

            it('resolves $parent.$parent.field to the grandparent type with parentLevel 2', () => {
                expect(cellVars.resolveAccessor(['$parent', '$parent', 'title'])).toEqual(
                    new Accessor('vs', ['title'], [], JayString, 2),
                );
            });

            it('reports an unknown member of the parent scope', () => {
                expect(itemVars.resolveAccessor(['$parent', 'nope'])).toEqual(
                    new Accessor(
                        'vs',
                        ['nope'],
                        ['the data field [nope] not found in Jay data'],
                        JayUnknown,
                        1,
                    ),
                );
            });

            it('reports $parent used at the root scope with no parent', () => {
                expect(listVars.resolveAccessor(['$parent', 'x'])).toEqual(
                    new Accessor(
                        'vs',
                        ['x'],
                        ['$parent used but there is no parent scope 1 level(s) up'],
                        JayUnknown,
                        1,
                    ),
                );
            });
        });

        describe('codegen widens the closure signature with parent params', () => {
            it('renders a $parent text binding with the parent param', () => {
                const actual = parseTextExpression('{$parent.listTitle}', itemVars);
                expect(actual.rendered).toEqual('dt((vs1, _p1) => _p1.listTitle)');
                expect(actual.imports.has(Import.dynamicText)).toBeTruthy();
            });

            it('renders a $parent.$parent text binding with both parent params', () => {
                const actual = parseTextExpression('{$parent.$parent.title}', cellVars);
                expect(actual.rendered).toEqual('dt((vs2, _p1, _p2) => _p2.title)');
            });

            it('mixes self and $parent accessors in one text binding', () => {
                const actual = parseTextExpression('{name} from {$parent.listTitle}', itemVars);
                expect(actual.rendered).toEqual(
                    'dt((vs1, _p1) => `${vs1.name} from ${_p1.listTitle}`)',
                );
            });

            it('renders a $parent attribute binding with the parent param', () => {
                const actual = parseAttributeExpression('{$parent.listTitle}', itemVars);
                expect(actual.rendered).toEqual('da((vs1, _p1) => _p1.listTitle)');
            });
        });
    });

    // DL#193 §C (Phase 2a) — the parent-scope pragma marks a whole binding value as authored in
    // the outer scope. `doParse` strips it and resolves the value one scope up (Capability A), so
    // only genuine field accessors climb — enum values, class names, and literals stay put.
    describe('parent-scope pragma (DL#193 §C)', () => {
        const P = '@jay:parent ';
        // A component instance scope (depth 0, `vs`) whose parent is the page scope — the exact
        // shape the override merge produces: content authored on the page, spliced into the child.
        const pageVars = new Variables(
            new JayObjectType('PageData', {
                documentName: JayString,
                status: new JayEnumType('Status', ['active', 'archived']),
                isPinned: JayBoolean,
                size: JayNumber,
            }),
        );
        const compVars = new Variables(
            new JayObjectType('CompData', { ownField: JayString }),
            pageVars,
            0,
        );

        it('without the pragma, resolves against the child scope', () => {
            expect(parseTextExpression('{ownField}', compVars).rendered).toEqual(
                'dt(vs => vs.ownField)',
            );
        });

        it('marks a text binding to the parent scope', () => {
            const actual = parseTextExpression(`${P}{documentName}`, compVars);
            expect(actual.rendered).toEqual('dt((vs, _p1) => _p1.documentName)');
            expect(actual.imports.has(Import.dynamicText)).toBeTruthy();
        });

        it('marks an attribute binding to the parent scope', () => {
            expect(parseAttributeExpression(`${P}{documentName}`, compVars).rendered).toEqual(
                'da((vs, _p1) => _p1.documentName)',
            );
        });

        it('marks a property binding to the parent scope', () => {
            expect(parsePropertyExpression(`${P}{documentName}`, compVars).rendered).toEqual(
                'dp((vs, _p1) => _p1.documentName)',
            );
        });

        it('marks a boolean attribute (brace-less) to the parent scope', () => {
            expect(parseBooleanAttributeExpression(`${P}isPinned`, compVars).rendered).toEqual(
                'ba((vs, _p1) => _p1.isPinned)',
            );
        });

        it('marks a condition (if=) to the parent scope', () => {
            expect(parseCondition(`${P}isPinned`, compVars).rendered).toEqual(
                '(vs, _p1) => _p1.isPinned',
            );
        });

        // The reason a whole-expression mark beats a per-accessor rewrite: the parser tells a field
        // (`status`, climbs) from an enum value (`active`) and a class name (`primary`, both stay).
        it('shifts only the field in a compound class ternary, leaving enum value and class name', () => {
            expect(
                parseClassExpression(`${P}{status == active ? primary}`, compVars).rendered,
            ).toEqual("da((vs, _p1) => _p1.status === Status.active?'primary':'')");
        });

        it('marks a style template value to the parent scope', () => {
            const result = parseStyleDeclarations(`${P}width: {size}px`, compVars);
            expect(result.declarations[0].valueFragment.rendered).toEqual(
                'dp((vs, _p1) => `${_p1.size}px`)',
            );
        });

        it('leaves jay.* bindings local (not shifted)', () => {
            const actual = parseTextExpression(`${P}{jay.foo}`, compVars);
            expect(actual.rendered).toEqual('dt(vs => vs.__jay?.foo)');
            expect(actual.parentDepth).toEqual(0);
        });

        it('strips the pragma from a static value with no shift', () => {
            expect(parseAttributeExpression(`${P}Static`, compVars).rendered).toEqual("'Static'");
        });
    });

    // DL#194 (Tier 2 inlining) — a no-code composite is spliced into the usage site, so each
    // contract-ViewState field is a compile-time projection of the usage-site expression bound to
    // it. The card's root scope carries an alias map (`heading` → the usage-site accessor
    // `item.title`) resolved in `resolveAccessor`, so binding substitution needs no grammar change.
    describe('Tier 2 alias substitution (DL#194)', () => {
        // The usage site (parent scope) where the card is placed.
        const usageVars = new Variables(
            new JayObjectType('UsageData', {
                item: new JayObjectType('Item', {
                    title: JayString,
                    author: new JayObjectType('Author', { name: JayString }),
                }),
                items: new JayArrayType(new JayObjectType('Row', { label: JayString })),
            }),
        );
        // Each usage-site prop expression, resolved against the parent scope, seeds one alias.
        const headingAlias = usageVars.resolveAccessor(['item', 'title']);
        const authorAlias = usageVars.resolveAccessor(['item', 'author']);
        const rowsAlias = usageVars.resolveAccessor(['items']);

        // The card's own root scope: its type is the card contract, but every contract field it
        // binds is projected through the alias map onto the usage-site scope it was inlined into.
        const cardVars = new Variables(
            new JayObjectType('CardData', {
                heading: JayString,
                author: new JayObjectType('Author', { name: JayString }),
                rows: new JayArrayType(new JayObjectType('CardRow', { text: JayString })),
            }),
            undefined,
            0,
            undefined,
            0,
            {},
            false,
            { heading: headingAlias, author: authorAlias, rows: rowsAlias },
        );
        // A card-internal forEach over an (aliased) contract array field.
        const cardRowVars = cardVars.childVariableFor(cardVars.resolveAccessor(['rows']));

        describe('resolveAccessor', () => {
            it('resolves a contract field to its usage-site accessor', () => {
                expect(cardVars.resolveAccessor(['heading'])).toEqual(
                    new Accessor('vs', ['item', 'title'], [], JayString),
                );
            });

            it('appends chained access onto the alias and walks its type', () => {
                expect(cardVars.resolveAccessor(['author', 'name'])).toEqual(
                    new Accessor('vs', ['item', 'author', 'name'], [], JayString),
                );
            });

            it('does not alias a card-internal forEach item field', () => {
                // The forEach iterates the aliased usage-site array (`items`: Row{label}), so its
                // item scope resolves the real usage-site item type and carries no aliases itself.
                expect(cardRowVars.resolveAccessor(['label'])).toEqual(
                    new Accessor('vs1', ['label'], [], JayString),
                );
            });

            it('composes a card-internal $parent climb with the alias (parentLevel 1)', () => {
                expect(cardRowVars.resolveAccessor(['$parent', 'heading'])).toEqual(
                    new Accessor('vs', ['item', 'title'], [], JayString, 1),
                );
            });
        });

        describe('codegen', () => {
            it('renders a contract-field text binding as the usage-site accessor', () => {
                expect(parseTextExpression('{heading}', cardVars).rendered).toEqual(
                    'dt(vs => vs.item?.title)',
                );
            });

            it('renders chained contract access as the usage-site accessor', () => {
                expect(parseTextExpression('{author.name}', cardVars).rendered).toEqual(
                    'dt(vs => vs.item?.author?.name)',
                );
            });

            it('renders a card-internal $parent binding with the parent param', () => {
                expect(parseTextExpression('{$parent.heading}', cardRowVars).rendered).toEqual(
                    'dt((vs1, _p1) => _p1.item?.title)',
                );
            });
        });

        // A structural component is often placed with STATIC props (`label="Live Status"`,
        // `status="success"`), coerced to the declared dataType. Those seed *literal* aliases —
        // an Accessor that renders its value verbatim, carrying the declared type for grammar.
        describe('literal (static) prop aliases', () => {
            const Status = new JayEnumType('Status', ['success', 'warning', 'error']);
            const litVars = new Variables(
                new JayObjectType('BadgeData', {
                    label: JayString,
                    status: Status,
                    count: JayNumber,
                }),
                undefined,
                0,
                undefined,
                0,
                {},
                false,
                {
                    label: new Accessor('', [], [], JayString, 0, "'Live Status'"),
                    status: new Accessor('', [], [], Status, 0, 'Status.success'),
                    count: new Accessor('', [], [], JayNumber, 0, '42'),
                },
            );

            it('renders a static string prop as its literal', () => {
                expect(parseTextExpression('{label}', litVars).rendered).toEqual(
                    "dt(vs => 'Live Status')",
                );
            });

            it('renders a static number prop as its literal', () => {
                expect(parseTextExpression('Count: {count}', litVars).rendered).toEqual(
                    'dt(vs => `Count: ${42}`)',
                );
            });

            it('renders an enum comparison against the static literal', () => {
                expect(
                    parseClassExpression('{status == success ? badge--success}', litVars).rendered,
                ).toEqual("da(vs => Status.success === Status.success?'badge--success':'')");
            });
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

        it('reports validation error for invalid enum value', () => {
            const actual = parseCondition('anEnum === invalid', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum === AnEnum.invalid');
            expect(actual.validations).toEqual([
                'Unknown enum value "invalid" for type AnEnum. Valid values: one, two, three',
            ]);
        });

        it('no validation error for valid enum value', () => {
            const actual = parseCondition('anEnum === two', defaultVars);
            expect(actual.validations).toEqual([]);
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

        it('startsWith with field right side', () => {
            const actual = parseCondition('member ^= member2', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.member.startsWith(vs.member2)');
        });

        it('startsWith with quoted literal', () => {
            const actual = parseCondition("member ^= '/docs'", defaultVars);
            expect(actual.rendered).toEqual("vs => vs.member.startsWith('/docs')");
        });

        it('startsWith combined with AND', () => {
            const actual = parseCondition("member ^= '/docs' && member2", defaultVars);
            expect(actual.rendered).toEqual(
                "vs => (vs.member.startsWith('/docs')) && (vs.member2)",
            );
        });

        it('negated startsWith via logical NOT', () => {
            const actual = parseCondition("!member || member ^= '/docs'", defaultVars);
            expect(actual.rendered).toEqual(
                "vs => (!vs.member) || (vs.member.startsWith('/docs'))",
            );
        });

        it('string field comparison with single identifier', () => {
            const actual = parseCondition('member === member2', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.member === vs.member2');
        });

        it('enum comparison unchanged with single identifier', () => {
            const actual = parseCondition('anEnum === one', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.anEnum === AnEnum.one');
        });

        it('string comparison with quoted literal', () => {
            const actual = parseCondition("member === '/about'", defaultVars);
            expect(actual.rendered).toEqual("vs => vs.member === '/about'");
        });

        it('string inequality with field', () => {
            const actual = parseCondition('member !== member2', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.member !== vs.member2');
        });

        it('jay.url.path accessor', () => {
            const actual = parseCondition("jay.url.path ^= '/docs'", defaultVars);
            expect(actual.rendered).toEqual("vs => vs.__jay?.url?.path.startsWith('/docs')");
        });

        it('jay.params accessor', () => {
            const actual = parseCondition('jay.params.slug === member', defaultVars);
            expect(actual.rendered).toEqual('vs => vs.__jay?.params?.slug === vs.member');
        });
    });

    describe('graceful parse error handling', () => {
        let defaultVars = new Variables(
            new JayObjectType('data', {
                member: JayString,
                anEnum: new JayEnumType('AnEnum', ['one', 'two', 'three']),
            }),
        );

        it('parseCondition with malformed expression returns fallback with validation', () => {
            const actual = parseCondition('member @@@ invalid', defaultVars);
            expect(actual.rendered).toEqual('vs => false');
            expect(actual.validations.length).toBeGreaterThan(0);
            expect(actual.validations[0]).toMatch(/Failed to parse expression/);
        });

        it('parseTextExpression with malformed expression returns visible error', () => {
            const actual = parseTextExpression('{{{bad}}}', defaultVars);
            expect(actual.rendered).toMatch(/INVALID/);
            expect(actual.validations.length).toBeGreaterThan(0);
        });

        it('parseClassExpression with malformed expression returns empty string', () => {
            const actual = parseClassExpression('{@@@ ? active}', defaultVars);
            expect(actual.rendered).toEqual("''");
            expect(actual.validations.length).toBeGreaterThan(0);
        });

        it('parseAccessor with malformed expression returns null accessor', () => {
            const actual = parseAccessor('123invalid', defaultVars);
            expect(actual.resolvedType).toBe(JayUnknown);
            expect(actual.validations.length).toBeGreaterThan(0);
        });

        it('parseBooleanAttributeExpression with malformed expression returns false', () => {
            const actual = parseBooleanAttributeExpression('member @@@ bad', defaultVars);
            expect(actual.rendered).toMatch(/ba\(vs => false\)/);
            expect(actual.validations.length).toBeGreaterThan(0);
        });

        it('validation message includes guide reference', () => {
            const actual = parseCondition('member @@@ invalid', defaultVars);
            expect(actual.validations[0]).toMatch(
                /agent-kit\/designer\/jay-html-template-syntax\.md/,
            );
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
            expect(actual.rendered).toEqual('da(vs => vs.classProperty)');
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration', () => {
            const actual = parseClassExpression(
                '{isOne? class1} {isTwo? classTwo} three',
                defaultVars,
            );
            expect(actual.rendered).toEqual(
                "da(vs => cx(vs.isOne?'class1':'', vs.isTwo?'classTwo':'', 'three'))",
            );
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
            expect(actual.imports.has(Import.classNames)).toBeTruthy();
        });

        it('one dynamic class declaration', () => {
            const actual = parseClassExpression('{isOne? class1}', defaultVars);
            expect(actual.rendered).toEqual("da(vs => vs.isOne?'class1':'')");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration with enum', () => {
            const actual = parseClassExpression('{anEnum == one? class1}', defaultVars);
            expect(actual.rendered).toEqual("da(vs => vs.anEnum === AnEnum.one?'class1':'')");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
        });

        it('dynamic class declaration with fallback', () => {
            const actual = parseClassExpression('{isOne? class1:class2} three', defaultVars);
            expect(actual.rendered).toEqual("da(vs => cx(vs.isOne?'class1':'class2', 'three'))");
            expect(actual.imports.has(Import.dynamicAttribute)).toBeTruthy();
            expect(actual.imports.has(Import.classNames)).toBeTruthy();
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
                "{cx(vs.isOne?'class1':'', vs.isTwo?'classTwo':'', 'three')}",
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
            expect(actual.rendered).toEqual("{cx(vs.isOne?'class1':'class2', 'three')}");
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

        it('static UUID string (digits followed by non-digit chars)', () => {
            const actual = parseComponentPropExpression(
                '42941ee7-1707-4b5d-a7d7-41e12da6ab9e',
                defaultVars,
            );
            expect(actual.rendered).toEqual("'42941ee7-1707-4b5d-a7d7-41e12da6ab9e'");
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

        it('report broken expression as validation error', () => {
            const actual = parseTextExpression('some broken { expression', defaultVars);
            expect(actual.validations.length).toBeGreaterThan(0);
            expect(actual.validations[0]).toMatch(/Failed to parse expression/);
            expect(actual.rendered).toMatch(/INVALID/);
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

        it('report broken expression as validation error', () => {
            const actual = parseReactTextExpression('some broken { expression', defaultVars);
            expect(actual.validations.length).toBeGreaterThan(0);
            expect(actual.validations[0]).toMatch(/Failed to parse expression/);
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

    describe('parseTemplateParts', () => {
        it('should return empty array for empty string', () => {
            expect(parseTemplateParts('')).toEqual([]);
        });

        it('should parse static-only value', () => {
            expect(parseTemplateParts('hello world')).toEqual([
                { kind: 'static', value: 'hello world' },
            ]);
        });

        it('should parse single binding', () => {
            expect(parseTemplateParts('{name}')).toEqual([{ kind: 'binding', value: 'name' }]);
        });

        it('should parse binding with dot path', () => {
            expect(parseTemplateParts('{user.profile.name}')).toEqual([
                { kind: 'binding', value: 'user.profile.name' },
            ]);
        });

        it('should parse mixed static and binding', () => {
            expect(parseTemplateParts('Hello {name}!')).toEqual([
                { kind: 'static', value: 'Hello ' },
                { kind: 'binding', value: 'name' },
                { kind: 'static', value: '!' },
            ]);
        });

        it('should parse multiple bindings', () => {
            expect(parseTemplateParts('{first} and {second}')).toEqual([
                { kind: 'binding', value: 'first' },
                { kind: 'static', value: ' and ' },
                { kind: 'binding', value: 'second' },
            ]);
        });

        it('should parse binding followed by static path', () => {
            expect(parseTemplateParts('{url}/v1/fit/w_300/file.jpg')).toEqual([
                { kind: 'binding', value: 'url' },
                { kind: 'static', value: '/v1/fit/w_300/file.jpg' },
            ]);
        });

        it('should trim whitespace in binding', () => {
            expect(parseTemplateParts('{ name }')).toEqual([{ kind: 'binding', value: 'name' }]);
        });
    });
});
