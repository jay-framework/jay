import { prettify } from '@jay-framework/compiler-shared';
import {
    readFileAndGenerateElementHydrateFile,
    readFixtureElementHydrateFile,
} from '../test-utils/file-utils';

describe('generate jay-html element hydrate', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for composite with dynamic text', async () => {
            const folder = 'basics/composite';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for refs with dynamic text', async () => {
            const folder = 'basics/refs';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for attributes with dynamic bindings only', async () => {
            const folder = 'basics/attributes';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for dynamic attribute parent with child ref', async () => {
            const folder = 'basics/dynamic-attr-with-child-ref';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for mixed content dynamic text (adoptText by position, DL#102)', async () => {
            const folder = 'basics/mixed-content-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for phase-aware dynamic text (only interactive bindings adopted)', async () => {
            const folder = 'basics/phase-aware-dynamic-text';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for phase-aware conditionals (only interactive conditions adopted)', async () => {
            const folder = 'basics/phase-aware-conditionals';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('conditions', () => {
        it('for basic if/else conditions', async () => {
            const folder = 'conditions/conditions';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for conditions with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('collections', () => {
        it('for basic forEach', async () => {
            const folder = 'collections/collections';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for forEach with dynamic class on item element', async () => {
            const folder = 'collections/foreach-dynamic-class';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('duplicate refs', () => {
        it('for headless contract with duplicate ref names', async () => {
            const folder = 'collections/duplicate-ref-only-one-used';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for same ref name in different branches', async () => {
            const folder = 'collections/duplicate-ref-different-branches';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });

    describe('components', () => {
        it('for counter component', async () => {
            const folder = 'components/counter';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for component in component', async () => {
            const folder = 'components/component-in-component';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('kebab-case component names resolve to camelCase imports', async () => {
            const folder = 'components/kebab-case-component';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        // Note: keyed headless validation is tested in generate-element.test.ts (standard compiler).
        // The hydrate compiler has the same validation but the test resolver doesn't support
        // keyed headless plugin resolution in the hydrate fixture setup.
    });

    describe('headless instances', () => {
        it('headless instance with forEach in template resolves bindings', async () => {
            const folder = 'contracts/page-with-headless-foreach-template';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
        });

        it('for page-level headless component', async () => {
            const folder = 'contracts/page-using-counter';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for simple headless instance', async () => {
            const folder = 'contracts/page-with-headless-instance';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for headless instance inside forEach', async () => {
            const folder = 'contracts/page-with-headless-in-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for headless instance inside slowForEach', async () => {
            const folder = 'contracts/page-with-headless-in-slow-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for headless instance mixed (child, conditional, slowForEach)', async () => {
            const folder = 'contracts/page-with-headless-mixed';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for fully static slowForEach (no slowForEachItem emitted)', async () => {
            const folder = 'contracts/page-with-fully-static-slow-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });

        it('for mixed static and headless slowForEach (coordinates wire to correct items)', async () => {
            const folder = 'contracts/page-with-mixed-static-slow-foreach';
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(hydrateFile.validations).toEqual([]);
            expect(await prettify(hydrateFile.val)).toEqual(
                await readFixtureElementHydrateFile(folder),
            );
        });
    });
});
