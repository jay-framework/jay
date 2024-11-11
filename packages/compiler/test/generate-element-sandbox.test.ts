import { prettify } from '../lib';
import { readFixtureElementBridgeFile } from './test-utils/file-utils';
import { readFileAndGenerateElementBridgeFile } from './test-utils/ts-compiler-test-utils';

describe('generate the element sandbox files', () => {
    describe('generate element bridges', () => {
        describe('basic', () => {
            it('for an empty element', async () => {
                const folder = 'basics/empty-element';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });

            it('for simple file with dynamic text', async () => {
                const folder = 'basics/simple-dynamic-text';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });

            it('for simple file refs', async () => {
                const folder = 'basics/refs';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });
        });

        describe('components', () => {
            it('counter component', async () => {
                const folder = 'components/counter';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });

            it('component in component', async () => {
                const folder = 'components/component-in-component';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });

            it('dynamic component in component', async () => {
                const folder = 'components/dynamic-component-in-component';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(
                        'components/dynamic-component-in-component',
                    ),
                );
            });
        });

        describe('collections', () => {
            it('component in component', async () => {
                const folder = 'collections/collection-with-refs';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });
        });
    });
});
