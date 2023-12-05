import { readTestFile } from '../test-utils/file-utils';
import { beforeAll } from 'vitest';
import { rollup, RollupBuild } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import { jayRuntime } from '../../lib';
import { JAY_QUERY_SANDBOX_MAIN_TS, JAY_QUERY_SANDBOX_WORKER_TS, prettify } from 'jay-compiler';
import path from 'node:path';
import fs from 'node:fs';
import { rimraf } from 'rimraf';
import { resolve } from 'path';
import { readFileWhenExists } from '../../lib/files.ts';

async function generateProject(projectRoot: string): Promise<RollupBuild> {
    const tsConfigFilePath = `${projectRoot}/source/tsconfig.json`;
    return await rollup({
        input: `${projectRoot}/source/index.ts`,
        logLevel: 'debug',
        plugins: [
            jayRuntime({ tsConfigFilePath, outputDir: '../dist' }),
            typescript({ tsconfig: tsConfigFilePath, check: false }),
        ],
    });
}

async function getCode(projectRoot: string, filename: string): Promise<string> {
    const filePath = path.resolve(projectRoot, 'dist', filename);
    const code = fs.readFileSync(filePath).toString();
    return await prettify(code);
}

describe('jayRuntime plugin - sandbox counter', () => {
    const projectRoot = './test/jayRuntime/fixtures/sandbox-counter';
    const getGeneratedFixturePath = (filename: string) => `generated/${filename}`;

    beforeAll(async () => {
        await rimraf(resolve(projectRoot, 'dist'));
        await generateProject(projectRoot);
    });

    describe('trusted', () => {
        it('generates application container', async () => {
            const filename = 'app.jay-html.ts';
            expect(await getCode(projectRoot, filename)).toEqual(
                await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
            );
        });
    });

    describe('sandbox main', () => {
        it('generates counter element', async () => {
            const filename = `counter.jay-html${JAY_QUERY_SANDBOX_MAIN_TS}`;
            expect(await getCode(projectRoot, filename)).toEqual(
                await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
            );
        });

        it('generates counter component bridge', async () => {
            const filename = `counter${JAY_QUERY_SANDBOX_MAIN_TS}`;
            expect(await getCode(projectRoot, filename)).toEqual(
                await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
            );
        });
    });
});
