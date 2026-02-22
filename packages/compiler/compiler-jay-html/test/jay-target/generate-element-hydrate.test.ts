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
    });
});
