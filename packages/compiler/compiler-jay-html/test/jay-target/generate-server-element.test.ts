import { prettify } from '@jay-framework/compiler-shared';
import {
    readFileAndGenerateServerElementFile,
    readFixtureServerElementFile,
    readFileAndGenerateElementHydrateFile,
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

        it('for html-string binding', async () => {
            const folder = 'basics/html-string-binding';
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

        it('for attributes with multi-line values', async () => {
            const folder = 'basics/multiline-attribute';
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

        it('for forEach on nested optional path emits ?? [] guard', async () => {
            const folder = 'collections/foreach-nested-optional';
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

        it('for headless instance with forEach in template', async () => {
            const folder = 'contracts/page-with-headless-foreach-template';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            expect(serverFile.validations).toEqual([]);
            // Must contain a for loop iterating the words array — not a direct field access
            expect(serverFile.val).toMatch(/for \(const \w+ of/);
            expect(serverFile.val).toMatch(/\.words/);
            expect(serverFile.val).toMatch(/\.text\b/);
        });

        // DL#183 — when the page body root IS a headless instance (<jay:contract>),
        // the server target must route it through renderServerElement (headless detection)
        // instead of emitting a literal <jay:...> element bound to the empty page ViewState.
        it('for root headless instance (DL#183)', async () => {
            const folder = 'contracts/page-with-root-headless-instance';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            // (a) no validations (previously: "[SSR] the data field [price] not found")
            expect(serverFile.validations).toEqual([]);
            // (b) no literal <jay:...> tag leaks into the stream
            expect(serverFile.val).not.toMatch(/<jay:/);
            // (c) reads the instance from __headlessInstances and binds children to it
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

    // DL#183 — the SSR-emitted coordinates for a root headless instance must match the
    // coordinates the hydrate target adopts, or hydration mis-wires (see #99 / #93).
    describe('cross-target coordinate alignment (DL#183)', () => {
        it('root headless instance: SSR jay-coordinate values equal hydrate adoption coordinates', async () => {
            const folder = 'contracts/page-with-root-headless-instance';
            const serverFile = await readFileAndGenerateServerElementFile(folder);
            const hydrateFile = await readFileAndGenerateElementHydrateFile(folder);
            expect(serverFile.validations).toEqual([]);
            expect(hydrateFile.validations).toEqual([]);

            // Prettify both so quote style is normalized before extraction.
            const serverSrc = await prettify(serverFile.val);
            const hydrateSrc = await prettify(hydrateFile.val);

            const collect = (source: string, re: RegExp): string[] => {
                const out = new Set<string>();
                for (const m of source.matchAll(re)) out.add(m[1]);
                return [...out].sort();
            };

            // Element coordinates emitted by the SSR stream.
            const serverCoords = collect(serverSrc, /jay-coordinate="([^"]+)"/g);
            // Element coordinates the hydrate target adopts.
            const hydrateCoords = collect(
                hydrateSrc,
                /adopt(?:Element|Text|DynamicElement)\('([^']+)'/g,
            );
            expect(serverCoords).toEqual(hydrateCoords);

            // The headless instance key must match on both sides.
            const serverKey = serverSrc.match(/__headlessInstances\?\.\['([^']+)'\]/)?.[1];
            const hydrateKey = hydrateSrc.match(
                /makeHeadlessInstanceComponent\([\s\S]*?,\s*'([^']+)',/,
            )?.[1];
            expect(serverKey).toBeDefined();
            expect(serverKey).toEqual(hydrateKey);
        });
    });
});
