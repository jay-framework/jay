import {readFileAndGenerateElementFile} from "../../test-utils/ts-compiler-test-utils";
import {prettify} from "../../../lib";
import {readFixtureElementFile, readFixtureReactElementFile} from "../../test-utils/file-utils";
import {GenerateTarget} from "jay-compiler-shared";

describe('generate the runtime file for react target', () => {
    describe('basics', () => {
        const options = {generateTarget: GenerateTarget.react};
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for simple file with static text', async () => {
            const folder = 'basics/simple-static-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for text with apostrophe', async () => {
            const folder = 'basics/text-with-apostrophe';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for an empty element', async () => {
            const folder = 'basics/empty-element';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for different data types', async () => {
            const folder = 'basics/data-types';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for a composition of divs', async () => {
            const folder = 'basics/composite';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for composition of divs 2', async () => {
            const folder = 'basics/composite 2';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('for styles', async () => {
            const folder = 'basics/styles';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('refs', async () => {
            const folder = 'basics/refs';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('with different attributes and properties', async () => {
            const folder = 'basics/attributes';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('with different view state input types', async () => {
            const folder = 'basics/dynamic-text-input-types';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

        it('whitespace collapsing and handling', async () => {
            const folder = 'basics/whitespace-and-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureReactElementFile(folder));
        });

    });
});