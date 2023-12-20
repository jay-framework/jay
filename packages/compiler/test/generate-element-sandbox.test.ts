import { prettify } from '../lib';
import { readGeneratedElementBridgeFile } from './test-utils/file-utils';
import { readFileAndGenerateElementBridgeFile } from './test-utils/ts-compiler-test-utils';

describe('generate the element sandbox files', () => {
    describe('generate element bridges', () => {
        describe('basic', () => {
            it('for an empty element', async () => {
                const folder = 'basics/empty-element';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(folder),
                );
            });

            it('for simple file with dynamic text', async () => {
                const folder = 'basics/empty-element';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(folder),
                );
            });

            it('for simple file refs', async () => {
                const folder = 'basics/refs';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(folder),
                );
            });
        });

        describe('components', () => {
            it('counter component', async () => {
                const folder = 'components/counter';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(folder),
                );
            });

            it('component in component', async () => {
                const folder = 'components/component-in-component';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(folder),
                );
            });

            it('dynamic component in component', async () => {
                const folder = 'components/dynamic-component-in-component';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedElementBridgeFile(
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
                    await readGeneratedElementBridgeFile(folder),
                );
            });
        });
    });
});
