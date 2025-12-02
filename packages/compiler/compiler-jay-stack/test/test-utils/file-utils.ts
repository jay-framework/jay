import { prettify } from '@jay-framework/compiler-shared';
import { promises } from 'node:fs';
// @ts-ignore
import path from 'path';

const { readFile } = promises;

export function fixtureFilePath(folder: string, filename: string): string {
    return path.resolve(__dirname, `../fixtures/${folder}/${filename}`);
}

export function fixtureDir(folder: string): string {
    return path.resolve(__dirname, `../fixtures/${folder}`);
}

export async function readFixtureFileRaw(folder: string, filename: string): Promise<string> {
    const content = (await readFile(fixtureFilePath(folder, filename))).toString();
    // Strip //@ts-ignore comments from fixture files
    return content.replace(/\/\/@ts-ignore\s*\n/g, '');
}

export async function readFixtureSource(folder: string): Promise<string> {
    return readFixtureFileRaw(folder, 'source.ts');
}

export async function readFixtureExpectedClient(folder: string): Promise<string> {
    return prettify(await readFixtureFileRaw(folder, 'expected-client.ts'));
}

export async function readFixtureExpectedServer(folder: string): Promise<string> {
    return prettify(await readFixtureFileRaw(folder, 'expected-server.ts'));
}

