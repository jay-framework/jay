export enum RuntimeMode {
    Trusted = 'trusted',
    SandboxMain = 'sandboxMain',
    SandboxWorker = 'sandboxWorker',
}

export const TS_EXTENSION = '.ts';
export const JAY_QUERY_PREFIX = '?jay-';

export const JAY_QUERY_SANDBOX_MAIN = `${JAY_QUERY_PREFIX}${RuntimeMode.SandboxMain}`;
export const JAY_QUERY_SANDBOX_WORKER = `${JAY_QUERY_PREFIX}${RuntimeMode.SandboxWorker}`;

export const JAY_QUERY_SANDBOX_MAIN_TS = `${JAY_QUERY_PREFIX}${RuntimeMode.SandboxMain}${TS_EXTENSION}`;
export const JAY_QUERY_SANDBOX_WORKER_TS = `${JAY_QUERY_PREFIX}${RuntimeMode.SandboxWorker}${TS_EXTENSION}`;

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
        hasExtension(filename, JAY_QUERY_SANDBOX_MAIN, { withTs }) ||
        hasExtension(filename, JAY_QUERY_SANDBOX_WORKER, { withTs })
    );
}

export function getModeFileExtension(
    isSandbox: boolean,
    importerMode: RuntimeMode,
    { withTs = false }: { withTs?: boolean } = {},
): string {
    const tsExtension = withTs ? TS_EXTENSION : '';
    const mode = getMode(isSandbox, importerMode);
    return mode === RuntimeMode.Trusted ? tsExtension : `${JAY_QUERY_PREFIX}${mode}${tsExtension}`;
}

export function getMode(isSandbox: boolean, importerMode: RuntimeMode): RuntimeMode {
    switch (importerMode) {
        case RuntimeMode.Trusted:
            return isSandbox ? RuntimeMode.SandboxMain : RuntimeMode.Trusted;
        default:
            return importerMode;
    }
}

export function getModeFromExtension(filename: string): RuntimeMode {
    // extracts mode from *.jay-html?jay-[mode].ts or *.ts?jay-[mode].ts
    const modeString = `?${filename.split('?').pop()}`;
    switch (modeString) {
        case JAY_QUERY_SANDBOX_MAIN_TS:
            return RuntimeMode.SandboxMain;
        case JAY_QUERY_SANDBOX_WORKER_TS:
            return RuntimeMode.SandboxWorker;
        default:
            return RuntimeMode.Trusted;
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
