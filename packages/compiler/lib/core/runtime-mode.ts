import {Runtime} from "node:inspector";

export enum RuntimeMode {
    MainTrusted = 'mainTrusted',
    MainSandbox = 'mainSandbox',
    WorkerTrusted = 'workerTrusted',
    WorkerSandbox = 'workerSandbox',
}

export type MainRuntimeModes = RuntimeMode.MainSandbox | RuntimeMode.MainTrusted

export const TS_EXTENSION = '.ts';
export const JAY_QUERY_PREFIX = '?jay-';

export const JAY_QUERY_MAIN_SANDBOX = `${JAY_QUERY_PREFIX}${RuntimeMode.MainSandbox}`;
export const JAY_QUERY_WORKER_TRUSTED = `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerTrusted}`;
export const JAY_QUERY_WORKER_SANDBOX = `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerSandbox}`;

export const JAY_QUERY_MAIN_SANDBOX_TS = `${JAY_QUERY_PREFIX}${RuntimeMode.MainSandbox}${TS_EXTENSION}`;
export const JAY_QUERY_WORKER_TRUSTED_TS = `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerTrusted}${TS_EXTENSION}`;
export const JAY_QUERY_WORKER_SANDBOX_TS = `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerSandbox}${TS_EXTENSION}`;

export function hasExtension(
    filename: string,
    extension: string,
    { withTs = false }: { withTs?: boolean } = {},
): boolean {
    const fullExtension = withTs ? `${extension}${TS_EXTENSION}` : extension;
    return filename.endsWith(fullExtension) && filename.length > fullExtension.length;
}

export function hasJayModeExtension(
    filename: string,
    { withTs = false }: { withTs?: boolean } = {},
): boolean {
    return (
        hasExtension(filename, JAY_QUERY_MAIN_SANDBOX, { withTs }) ||
        hasExtension(filename, JAY_QUERY_WORKER_TRUSTED, { withTs }) ||
        hasExtension(filename, JAY_QUERY_WORKER_SANDBOX, { withTs })
    );
}

export function getModeFileExtension(
    isSandbox: boolean,
    importerMode: RuntimeMode,
    { withTs = false }: { withTs?: boolean } = {},
): string {
    const tsExtension = withTs ? TS_EXTENSION : '';
    const mode = getMode(isSandbox, importerMode);
    return mode === RuntimeMode.MainTrusted
        ? tsExtension
        : `${JAY_QUERY_PREFIX}${mode}${tsExtension}`;
}

export function getMode(isSandbox: boolean, importerMode: RuntimeMode): RuntimeMode {
    switch (importerMode) {
        case RuntimeMode.MainTrusted:
            return isSandbox ? RuntimeMode.MainSandbox : RuntimeMode.MainTrusted;
        case RuntimeMode.WorkerTrusted:
            return isSandbox ? RuntimeMode.WorkerSandbox : RuntimeMode.WorkerTrusted;
        default:
            return importerMode;
    }
}

export function getModeFromExtension(filename: string): RuntimeMode {
    // extracts mode from *.jay-html?jay-[mode].ts or *.ts?jay-[mode].ts
    const modeString = `?${filename.split('?').pop()}`;
    switch (modeString) {
        case JAY_QUERY_MAIN_SANDBOX_TS:
            return RuntimeMode.MainSandbox;
        case JAY_QUERY_WORKER_TRUSTED_TS:
            return RuntimeMode.WorkerTrusted;
        case JAY_QUERY_WORKER_SANDBOX_TS:
            return RuntimeMode.WorkerSandbox;
        default:
            return RuntimeMode.MainTrusted;
    }
}

export function getJayTsFileSourcePath(filename: string): string {
    // extracts [name] from [name]?jay-[mode].ts
    const beforeExtension = filename.split('?');
    if (beforeExtension.length === 1) {
        throw new Error(
            `Filename ${filename} does not contain jay mode extension "?jay-[mode].ts"`,
        );
    }
    return `${beforeExtension.slice(0, -1).join('')}.ts`;
}

export function withoutExtension(filename: string, extension: string): string {
    if (!filename.endsWith(extension)) {
        throw new Error(`Filename ${filename} does not end with extension ${extension}`);
    }
    return filename.slice(0, -extension.length);
}
