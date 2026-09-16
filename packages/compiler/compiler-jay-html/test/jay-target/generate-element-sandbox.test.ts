import { readFixtureElementBridgeFile, readFixtureFileRaw } from '../test-utils/file-utils';
import { readFileAndGenerateElementBridgeFile } from '../test-utils/file-utils';
import { prettify } from '@jay-framework/compiler-shared';

describe('generate jay-html element for sandbox', () => {
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
                    await readFixtureElementBridgeFile('components/dynamic-component-in-component'),
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

            // DL#193: a $parent binding inside a forEach compiles cleanly on the bridge
            // (worker) target. The worker only tracks the collection skeleton
            // (sandboxForEach with no child body) — the $parent-bound dt/da render on the
            // main/trusted side — so the bridge output carries no dt/da and no validations.
            it('$parent binding inside a forEach', async () => {
                const folder = 'collections/foreach-parent-binding';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureElementBridgeFile(folder),
                );
            });
        });

        describe('linked contract', () => {
            it('generate element file with linked contract', async () => {
                const folder = 'contracts/page-using-counter';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await prettify(await readFixtureFileRaw(folder, 'generated-element-bridge.ts')),
                );
            });

            it('generate element file with linked contract with transitive enum imports', async () => {
                const folder = 'contracts/page-using-named-counter';
                const runtimeFile = await readFileAndGenerateElementBridgeFile(folder);
                expect(await prettify(runtimeFile)).toEqual(
                    await prettify(await readFixtureFileRaw(folder, 'generated-element-bridge.ts')),
                );
            });
        });
    });
});
