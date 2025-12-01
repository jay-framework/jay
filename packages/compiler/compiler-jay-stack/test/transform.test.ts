import { describe, it, expect } from 'vitest';
import { transformJayStackBuilder } from '../lib';
import {
    readFixtureSource,
    readFixtureExpectedClient,
    readFixtureExpectedServer,
} from './test-utils/file-utils';
import { prettify } from '@jay-framework/compiler-shared';

describe('Jay Stack Builder Code Splitting', () => {
    describe('Basic Page', () => {
        it('should strip server methods for client build', async () => {
            const source = await readFixtureSource('basic-page');
            const expected = await readFixtureExpectedClient('basic-page');

            const result = transformJayStackBuilder(source, 'test.ts', 'client');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });

        it('should strip client methods for server build', async () => {
            const source = await readFixtureSource('basic-page');
            const expected = await readFixtureExpectedServer('basic-page');

            const result = transformJayStackBuilder(source, 'test.ts', 'server');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });
    });

    describe('With Contexts', () => {
        it('should preserve contexts for client build', async () => {
            const source = await readFixtureSource('with-contexts');
            const expected = await readFixtureExpectedClient('with-contexts');

            const result = transformJayStackBuilder(source, 'test.ts', 'client');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });

        it('should strip contexts for server build', async () => {
            const source = await readFixtureSource('with-contexts');
            const expected = await readFixtureExpectedServer('with-contexts');

            const result = transformJayStackBuilder(source, 'test.ts', 'server');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });
    });

    describe('With Inline Functions', () => {
        it('should handle inline arrow functions for client build', async () => {
            const source = await readFixtureSource('with-inline-functions');
            const expected = await readFixtureExpectedClient('with-inline-functions');

            const result = transformJayStackBuilder(source, 'test.ts', 'client');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });

        it('should handle inline arrow functions for server build', async () => {
            const source = await readFixtureSource('with-inline-functions');
            const expected = await readFixtureExpectedServer('with-inline-functions');

            const result = transformJayStackBuilder(source, 'test.ts', 'server');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });
    });

    describe('With Regular Functions', () => {
        it('should preserve used functions for client build', async () => {
            const source = await readFixtureSource('with-regular-functions');
            const expected = await readFixtureExpectedClient('with-regular-functions');

            const result = transformJayStackBuilder(source, 'test.ts', 'client');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });

        it('should preserve used functions for server build', async () => {
            const source = await readFixtureSource('with-regular-functions');
            const expected = await readFixtureExpectedServer('with-regular-functions');

            const result = transformJayStackBuilder(source, 'test.ts', 'server');
            const actual = await prettify(result.code);

            expect(actual).toEqual(expected);
        });
    });
});
