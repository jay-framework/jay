import { createTsSourceFileFromSource, JayUnknown } from '../../lib';
import { parseImportLinks } from '../../lib/ts-file/parse-jay-file/parse-import-links';
import { readFixtureFile } from '../test-utils/ts-compiler-test-utils';

describe('parseImportLinks', () => {
    const fixturePath = 'sandboxed/sandboxed-counter/generated/main/app.jay-html.ts';

    it('returns jay import links', async () => {
        const { filePath, code } = await readFixtureFile(fixturePath);
        const sourceFile = createTsSourceFileFromSource(filePath, code);
        expect(parseImportLinks(sourceFile)).toEqual([
            {
                module: 'jay-runtime',
                names: [
                    {
                        name: 'JayElement',
                        type: JayUnknown,
                    },
                    {
                        as: 'e',
                        name: 'element',
                        type: JayUnknown,
                    },
                    {
                        name: 'ConstructContext',
                        type: JayUnknown,
                    },
                    {
                        as: 'cr',
                        name: 'compRef',
                        type: JayUnknown,
                    },
                    {
                        name: 'RenderElementOptions',
                        type: JayUnknown,
                    },
                ],
                sandbox: false,
            },
            {
                module: 'jay-secure',
                names: [
                    {
                        as: 'mr',
                        name: 'mainRoot',
                        type: JayUnknown,
                    },
                    {
                        name: 'secureChildComp',
                        type: JayUnknown,
                    },
                ],
                sandbox: false,
            },
            {
                module: './counter-refs',
                names: [
                    {
                        name: 'CounterRef',
                        type: JayUnknown,
                    },
                ],
                sandbox: false,
            },
            {
                module: './counter?jay-mainSandbox',
                names: [
                    {
                        name: 'Counter',
                        type: JayUnknown,
                    },
                ],
                sandbox: true,
            },
        ]);
    });
});
