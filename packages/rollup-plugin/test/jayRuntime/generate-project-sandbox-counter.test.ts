import { readTestFile } from '../test-utils/file-utils';
import { beforeAll } from 'vitest';
import { rollup, RollupBuild } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import { jayRuntime } from '../../lib';
import { prettify } from 'jay-compiler';
import path from 'node:path';
import fs from 'node:fs';

async function generateProject(projectRoot: string): Promise<RollupBuild> {
    const tsConfigFilePath = `${projectRoot}/source/tsconfig.json`;
    return await rollup({
        input: `${projectRoot}/source/index.ts`,
        plugins: [
            jayRuntime({ tsConfigFilePath, outputDir: `../dist/main` }),
            typescript({ tsconfig: tsConfigFilePath }),
        ],
    });
}

async function getCode(projectRoot: string, filename: string): Promise<string> {
    const filePath = path.resolve(projectRoot, 'dist/main', filename);
    const code = fs.readFileSync(filePath).toString();
    return await prettify(code);
}

describe('jayRuntime plugin - sandbox counter', () => {
    const projectRoot = './test/jayRuntime/fixtures/sandbox-counter';
    const getGeneratedFixturePath = (filename: string) => `generated/main/${filename}`;

    beforeAll(async () => {
        await generateProject(projectRoot);
    });

    it('generates application container', async () => {
        const filename = 'app.jay.html.ts';
        expect(await getCode(projectRoot, filename)).toEqual(
            await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
        );
    });

    it('generates counter main view', async () => {
        const filename = 'counter.jay.html.ts';
        expect(await getCode(projectRoot, filename)).toEqual(
            await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
        );
    });
});
