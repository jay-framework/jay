import { prettify } from '@jay-framework/compiler-shared';
import {
    readFileAndGenerateServerElementFile,
    readFixtureServerElementFile,
} from '../test-utils/file-utils';

describe('generate jay-html server element', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for composite with dynamic text', async () => {
            const folder = 'basics/composite';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for refs with dynamic text', async () => {
            const folder = 'basics/refs';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for style bindings with dynamic values', async () => {
            const folder = 'basics/style-bindings';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for attributes with dynamic bindings', async () => {
            const folder = 'basics/attributes';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for phase-aware dynamic text (only interactive bindings get jay-coordinate)', async () => {
            const folder = 'basics/phase-aware-dynamic-text';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for phase-aware conditionals (only interactive conditions get jay-coordinate)', async () => {
            const folder = 'basics/phase-aware-conditionals';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });

    describe('conditions', () => {
        it('for basic if/else conditions', async () => {
            const folder = 'conditions/conditions';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for headless enum conditions', async () => {
            const folder = 'contracts/page-using-counter';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });

    describe('collections', () => {
        it('for basic forEach', async () => {
            const folder = 'collections/collections';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });

    describe('headless instances', () => {
        it('for simple headless instance', async () => {
            const folder = 'contracts/page-with-headless-instance';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for headless instance inside forEach', async () => {
            const folder = 'contracts/page-with-headless-in-foreach';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for headless instance inside slowForEach', async () => {
            const folder = 'contracts/page-with-headless-in-slow-foreach';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for headless instance mixed (child, conditional, slowForEach)', async () => {
            const folder = 'contracts/page-with-headless-mixed';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });

    describe('slowForEach', () => {
        it('for slowForEach with dynamic bindings on element', async () => {
            const folder = 'collections/slow-for-each-dynamic-bindings';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });

    describe('async', () => {
        it('for async simple types', async () => {
            const folder = 'async/async-simple-types';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for async objects', async () => {
            const folder = 'async/async-objects';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });

        it('for async arrays', async () => {
            const folder = 'async/async-arrays';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(await prettify(serverFile.val)).toEqual(
                await readFixtureServerElementFile(folder),
            );
        });
    });
});
