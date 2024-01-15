import { promises, readFileSync } from 'node:fs';
import path from 'node:path';
import { prettify } from 'jay-compiler';
import { rimraf } from 'rimraf';
import { removeComments } from '../../../compiler/lib/utils/prettify';

const { readFile } = promises;

const DIST_DIR = 'dist';

export function readTestFile(folder, filename): { filePath: string; code: string } {
    const filePath = path.resolve(__dirname, '..', folder, filename);
    const code = readFileSync(filePath).toString();
    return { filePath, code };
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

export async function getExpectedCode(
    projectRoot: string,
    filename: string,
    isWorker: boolean,
): Promise<string> {
    const filePath = path.resolve(projectRoot, 'generated', isWorker ? 'worker' : 'main', filename);
    const code = (await readFile(filePath)).toString();
    return removeComments(code);
}

export async function cleanDistDirectory(projectRoot: string): Promise<void> {
    await rimraf(path.resolve(projectRoot, DIST_DIR));
}
