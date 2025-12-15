import {
    checkValidationErrors,
    GenerateTarget,
    JAY_CONTRACT_EXTENSION,
    JayType,
    MainRuntimeModes,
    prettify,
    removeComments,
    RuntimeMode,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { promises } from 'node:fs';
import { parseJayFile } from '../../lib';
import { JayHtmlSourceFile } from '../../lib';
import { generateElementBridgeFile, generateElementFileReactTarget } from '../../lib';
import { generateElementFile } from '../../lib';
import path from 'path';
import { JayImportResolver } from '../../lib';
import { TEST_IMPORT_RESOLVER } from './test-resolver';

const { readFile } = promises;

export function fixtureFilePath(folder, filename): string {
    return path.resolve(__dirname, `../fixtures/${folder}/${filename}`);
}

export function fixtureDir(folder): string {
    return path.resolve(__dirname, `../fixtures/${folder}`);
}

export async function readFixtureElementFile(folder) {
    return prettify(await readFixtureFileRaw(folder, 'generated-element.ts'));
}

export async function readFixtureFile(folder, file) {
    return prettify(await readFixtureFileRaw(folder, `${file}.ts`));
}

export async function readFixtureFileRaw(folder, filename): Promise<string> {
    return removeComments((await readFile(fixtureFilePath(folder, filename))).toString());
}

export async function readFixtureSourceJayFile(folder, file) {
    return readFixtureFileRaw(folder, `${file}.jay-html`);
}

export async function readFixtureJayContractFile(folder, file) {
    return readFixtureFileRaw(folder, `${file}${JAY_CONTRACT_EXTENSION}`);
}

export async function readFixtureElementBridgeFile(folder) {
    return prettify(await readFixtureFileRaw(folder, 'generated-element-bridge.ts'));
}

export async function readFixtureReactFile(folder, file) {
    return prettify(await readFixtureFileRaw(folder, `${file}.tsx`));
}

export async function readFixtureReactElementFile(folder) {
    return prettify(
        removeComments(await readFixtureFileRaw(folder, 'generated-react-element.tsx')),
    );
}

export async function readFixtureElementDefinitionFile(
    folder: string,
    filename: string = 'generated-element.d.ts',
) {
    return prettify(await readFixtureFileRaw(folder, filename));
}

export function getFileFromFolder(folder: string): string {
    return folder.split('/').slice(-1)[0];
}

export async function readFileAndGenerateElementBridgeFile(folder: string, givenFile?: string, resolver?: JayImportResolver) {
    const dirname = fixtureDir(folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readFixtureSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        await parseJayFile(jayFile, `${file}.jay-html`, dirname, {}, resolver || TEST_IMPORT_RESOLVER),
    );
    return generateElementBridgeFile(parsedFile);
}

export async function readAndParseJayFile(
    folder: string,
    givenFile?: string,
    resolver?: JayImportResolver,
): Promise<WithValidations<JayHtmlSourceFile>> {
    const file = givenFile || getFileFromFolder(folder);
    const dirname = fixtureDir(folder);
    const filename = `${file}.jay-html`;
    const code = await readFixtureSourceJayFile(folder, file);
    return await parseJayFile(code, filename, dirname, {}, resolver || TEST_IMPORT_RESOLVER);
}

export interface ReadFileAndGenerateElementFileOptions {
    importerMode?: MainRuntimeModes;
    givenFile?: string;
    generateTarget?: GenerateTarget;
    resolver?: JayImportResolver;
}

export async function readFileAndGenerateElementFile(
    folder: string,
    options?: ReadFileAndGenerateElementFileOptions,
) {
    const givenFile = options?.givenFile || null;
    const importerMode = options?.importerMode || RuntimeMode.MainTrusted;
    const generateTarget = options?.generateTarget || GenerateTarget.jay;
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readFixtureSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        await parseJayFile(jayFile, `${file}.jay-html`, dirname, {}, options?.resolver || TEST_IMPORT_RESOLVER),
    );
    if (options?.generateTarget === GenerateTarget.react)
        return generateElementFileReactTarget(parsedFile, importerMode);
    else return generateElementFile(parsedFile, importerMode);
}
