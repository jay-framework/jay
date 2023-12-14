import { promises } from 'node:fs';
import path from 'node:path';
import { prettify } from 'jay-compiler';
import { rimraf } from 'rimraf';

const { readFile } = promises;

const DIST_DIR = 'dist';

export async function readTestFile(folder, filename): Promise<string> {
    return (await readFile(path.resolve(__dirname, '..', '..', folder, filename))).toString();
}

export async function getGeneratedCode(
    projectRoot: string,
    filename: string,
    isWorker: boolean,
): Promise<string> {
    const filePath = path.resolve(projectRoot, DIST_DIR, isWorker ? 'worker' : 'main', filename);
    const code = (await readFile(filePath)).toString();
    return await prettify(code);
}

export async function cleanDistDirectory(projectRoot: string): Promise<void> {
    await rimraf(path.resolve(projectRoot, DIST_DIR));
}
