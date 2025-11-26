import {
    readFileAndGenerateElementFile,
    ReadFileAndGenerateElementFileOptions,
} from '../test-utils/file-utils';
import { readFixtureReactElementFile, readFixtureReactFile } from '../test-utils/file-utils';
import { GenerateTarget, prettify, RuntimeMode } from '@jay-framework/compiler-shared';

describe('generate jay-html element for react target', () => {
    const options: ReadFileAndGenerateElementFileOptions = { generateTarget: GenerateTarget.react };

    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for simple file with static text', async () => {
            const folder = 'basics/simple-static-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for text with apostrophe', async () => {
            const folder = 'basics/text-with-apostrophe';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for an empty element', async () => {
            const folder = 'basics/empty-element';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for different data types', async () => {
            const folder = 'basics/data-types';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for a composition of divs', async () => {
            const folder = 'basics/composite';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for composition of divs 2', async () => {
            const folder = 'basics/composite 2';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for styles', async () => {
            const folder = 'basics/styles';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('refs', async () => {
            const folder = 'basics/refs';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('with different attributes and properties', async () => {
            const folder = 'basics/attributes';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('with different view state input types', async () => {
            const folder = 'basics/dynamic-text-input-types';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('whitespace collapsing and handling', async () => {
            const folder = 'basics/whitespace-and-text';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });
    });

    describe('conditions', () => {
        it('for conditional', async () => {
            const folder = 'conditions/conditions';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for conditional with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for conditional with the same ref on different branches', async () => {
            const folder = 'conditions/conditions-with-repeated-ref';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for enums and conditions', async () => {
            const folder = 'conditions/conditions-with-enum';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });
    });

    describe('collections', () => {
        it('for collections', async () => {
            const folder = 'collections/collections';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for collections with refs', async () => {
            const folder = 'collections/collection-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for nested collections with refs in variants', async () => {
            const folder = 'collections/nested-collection-with-refs-in-variants';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });

        it('for collections with conditions', async () => {
            const folder = 'collections/collections-with-conditions';
            const elementFile = await readFileAndGenerateElementFile(folder, options);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await readFixtureReactElementFile(folder),
            );
        });
    });

    describe('jay2react components', () => {
        describe('import jay component from jay-html with react compile target', () => {
            const options: ReadFileAndGenerateElementFileOptions = {
                generateTarget: GenerateTarget.react,
                importerMode: RuntimeMode.MainTrusted,
            };
            const sourceFolder = 'components-react-target/source';
            const targetFolder = 'components-react-target/target';
            it('for simple component element', async () => {
                const elementFile = await readFileAndGenerateElementFile(sourceFolder, {
                    ...options,
                    givenFile: 'counter',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(targetFolder, 'counter.jay-html'),
                );
            });

            it('nesting components in other components', async () => {
                const elementFile = await readFileAndGenerateElementFile(sourceFolder, {
                    ...options,
                    givenFile: 'component-in-component',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(targetFolder, 'component-in-component.jay-html'),
                );
            }, 10000);

            it.skip('dynamic nesting components in other components', async () => {
                const elementFile = await readFileAndGenerateElementFile(sourceFolder, {
                    ...options,
                    givenFile: 'component-in-component',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(targetFolder, 'component-in-component.jay-html'),
                );
            });

            it.skip('recursive-components', async () => {
                const folder = 'components-react-target/recursive-components';
                const elementFile = await readFileAndGenerateElementFile(folder, options);
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(folder, 'generated-react-element-main-trusted'),
                );
            });

            it.skip('recursive-components-2', async () => {
                const folder = 'components-react-target/recursive-components-2';
                const elementFile = await readFileAndGenerateElementFile(folder, options);
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(folder, 'generated-react-element-main-trusted'),
                );
            });

            it.skip('tree', async () => {
                const folder = 'components-react-target/tree';
                const elementFile = await readFileAndGenerateElementFile(folder, {
                    ...options,
                    givenFile: 'tree-node',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureReactFile(folder, 'generated-react-element-main-trusted'),
                );
            });
        });
    });
});
