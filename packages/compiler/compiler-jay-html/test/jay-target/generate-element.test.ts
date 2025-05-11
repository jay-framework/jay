import {
    readFixtureElementFile,
    readFixtureFile,
    readFixtureFileRaw,
} from '../test-utils/file-utils';
import { readFileAndGenerateElementFile } from '../test-utils/file-utils';
import { prettify, RuntimeMode } from 'jay-compiler-shared';

describe('generate jay-html element', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for simple file with static text', async () => {
            const folder = 'basics/simple-static-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for text with apostrophe', async () => {
            const folder = 'basics/text-with-apostrophe';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for an empty element', async () => {
            const folder = 'basics/empty-element';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for different data types', async () => {
            const folder = 'basics/data-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for a composition of divs', async () => {
            const folder = 'basics/composite';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for composition of divs 2', async () => {
            const folder = 'basics/composite 2';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for styles', async () => {
            const folder = 'basics/styles';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('refs', async () => {
            const folder = 'basics/refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('with different attributes and properties', async () => {
            const folder = 'basics/attributes';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('with different view state input types', async () => {
            const folder = 'basics/dynamic-text-input-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('whitespace collapsing and handling', async () => {
            const folder = 'basics/whitespace-and-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('conditions', () => {
        it('for conditional', async () => {
            const folder = 'conditions/conditions';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for conditional with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for conditional with the same ref on different branches', async () => {
            const folder = 'conditions/conditions-with-repeated-ref';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for enums and conditions', async () => {
            const folder = 'conditions/conditions-with-enum';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('collections', () => {
        it('for collections', async () => {
            const folder = 'collections/collections';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for collections with refs', async () => {
            const folder = 'collections/collection-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for collections with conditions', async () => {
            const folder = 'collections/collections-with-conditions';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('components', () => {
        describe('for main trusted environment (running in main window, component is not sandboxed)', () => {
            const importerMode: RuntimeMode = RuntimeMode.MainTrusted;
            it('for simple refs', async () => {
                const folder = 'components/counter';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('nesting components in other components', async () => {
                const folder = 'components/component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('dynamic nesting components in other components', async () => {
                const folder = 'components/dynamic-component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('recursive-components', async () => {
                const folder = 'components/recursive-components';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('recursive-components-2', async () => {
                const folder = 'components/recursive-components-2';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });

            it('tree', async () => {
                const folder = 'components/tree';
                const elementFile = await readFileAndGenerateElementFile(folder, {
                    importerMode,
                    givenFile: 'tree-node',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-trusted'),
                );
            });
        });

        describe('for main sandboxed environment (running in main window, component is sandboxed)', () => {
            const importerMode: RuntimeMode = RuntimeMode.MainSandbox;
            it('for simple refs', async () => {
                const folder = 'components/counter';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('nesting components in other components', async () => {
                const folder = 'components/component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('dynamic nesting components in other components', async () => {
                const folder = 'components/dynamic-component-in-component';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('recursive-components', async () => {
                const folder = 'components/recursive-components';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('recursive-components-2', async () => {
                const folder = 'components/recursive-components-2';
                const elementFile = await readFileAndGenerateElementFile(folder, { importerMode });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });

            it('tree', async () => {
                const folder = 'components/tree';
                const elementFile = await readFileAndGenerateElementFile(folder, {
                    importerMode,
                    givenFile: 'tree-node',
                });
                expect(elementFile.validations).toEqual([]);
                expect(await prettify(elementFile.val)).toEqual(
                    await readFixtureFile(folder, 'generated-element-main-sandbox'),
                );
            });
        });
    });

    describe('html namespaces', () => {
        it('for simple svg', async () => {
            const folder = 'html-namespaces/simple-svg';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });

        it('for simple mathml', async () => {
            const folder = 'html-namespaces/simple-mathml';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readFixtureElementFile(folder));
        });
    });

    describe('linked contract', () => {
        it('generate element file with linked contract', async () => {
            const folder = 'contracts/page';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(
                await prettify(await readFixtureFileRaw(folder, 'page.jay-html.ts')),
            );
        });
    });
});
