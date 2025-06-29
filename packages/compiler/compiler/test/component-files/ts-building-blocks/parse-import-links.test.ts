import { createTsSourceFileFromSource } from '../../../lib';
import {
    getImportByName,
    parseImportLinks,
} from '../../../lib/components-files/building-blocks/parse-import-links';
import { fixtureFilePath, readFixtureFile } from '../../test-utils/file-utils';
import { JayImportLink, JayUnknown } from '@jay-framework/compiler-shared';

describe('parseImportLinks', () => {
    const fixturePath = 'full-projects/counter/generated/main';
    const filename = 'app.jay-html';

    it('returns jay import links', async () => {
        const filePath = fixtureFilePath(fixturePath, filename);
        const code = await readFixtureFile(fixturePath, filename);
        const sourceFile = createTsSourceFileFromSource(filePath, code);
        expect(parseImportLinks(sourceFile)).toEqual([
            {
                module: '@jay-framework/runtime',
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
                        name: 'RenderElement',
                        type: JayUnknown,
                    },
                    {
                        name: 'ReferencesManager',
                        type: JayUnknown,
                    },
                    {
                        name: 'ConstructContext',
                        type: JayUnknown,
                    },
                    {
                        name: 'RenderElementOptions',
                        type: JayUnknown,
                    },
                    {
                        name: 'MapEventEmitterViewState',
                        type: JayUnknown,
                    },
                    {
                        name: 'JayContract',
                        type: JayUnknown,
                    },
                ],
                sandbox: false,
            },
            {
                module: '@jay-framework/secure',
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
                module: './function-repository',
                names: [
                    {
                        name: 'funcRepository',
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

describe('getImportByName', () => {
    const importLinks: JayImportLink[] = [
        {
            module: '@jay-framework/runtime',
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
            ],
            sandbox: false,
        },
        {
            module: '@jay-framework/secure',
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
    ];
    const component = '@jay-framework/runtime';
    const name = 'element';

    it('returns import by name', () => {
        const importName = getImportByName(importLinks, component, name);
        expect(importName).toEqual(importLinks[0].names[1]);
    });

    describe('on no import by name', () => {
        const name = 'other';

        it('returns undefined', () => {
            const importName = getImportByName(importLinks, component, name);
            expect(importName).toBeUndefined();
        });
    });
});
