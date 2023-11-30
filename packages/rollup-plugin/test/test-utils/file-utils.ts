import { promises } from 'node:fs';
import path from 'node:path';

const { readFile } = promises;

export async function readTestFile(folder, filename): Promise<string> {
    return (await readFile(path.resolve(__dirname, '..', '..', folder, filename))).toString();
}
