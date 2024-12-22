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
    });
});