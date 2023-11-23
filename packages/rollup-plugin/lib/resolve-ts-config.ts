import * as ts from 'typescript';
import * as path from 'node:path';
import { CompilerOptions, ParseConfigFileHost, ParsedCommandLine } from 'typescript';

const JAY_TS_COMPILER_OPTIONS_OVERRIDE: CompilerOptions = { noEmit: false };

import * as os from 'os';
import { FormatDiagnosticsHost } from 'typescript';
import { withOriginalTrace } from './errors.ts';
import { JayRollupConfig } from './types.ts';

const diagnosticsHost: FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => os.EOL,
    getCurrentDirectory: () => process.cwd(),
};

export function resolveTsCompilerOptions({
    tsConfigFilePath = 'tsconfig.json',
    tsCompilerOptionsOverrides = {},
}: JayRollupConfig): CompilerOptions {
    const compilerOptions = parseTsConfigFile(tsConfigFilePath, tsCompilerOptionsOverrides);
    if (!compilerOptions) {
        throw new Error(
            `Could not determine typescript compilerOptions from config file ${resolveTsConfigPath(
                tsConfigFilePath,
            )}`,
        );
    }
    const diagnosticErrorsMessage = compilerOptions.errors.map((diagnostic) =>
        ts.formatDiagnostic(diagnostic, diagnosticsHost),
    );
    if (diagnosticErrorsMessage.length > 0) {
        throw new Error(
            `Invalid typescript config for ${resolveTsConfigPath(
                tsConfigFilePath,
            )}\n${diagnosticErrorsMessage}`,
        );
    }
    return compilerOptions.options;
}

export function parseTsConfigFile(
    configFilePath: string,
    compilerOptions: CompilerOptions,
): ParsedCommandLine {
    try {
        return ts.getParsedCommandLineOfConfigFile(
            resolveTsConfigPath(configFilePath),
            { ...compilerOptions, ...JAY_TS_COMPILER_OPTIONS_OVERRIDE },
            getTsConfigHost(),
        );
    } catch (error) {
        throw withOriginalTrace(new Error('[jay] Failed to resolve tsconfig'), error);
    }
}

function resolveTsConfigPath(relativePath: string): string {
    const tsConfigPath = path.resolve(process.cwd(), relativePath);
    if (!ts.sys.fileExists(tsConfigPath)) {
        throw new Error(`[jay] Could not find specified tsconfig file at ${tsConfigPath}`);
    }
    return tsConfigPath;
}

function getTsConfigHost(): ParseConfigFileHost {
    return {
        fileExists: ts.sys.fileExists,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        readDirectory: ts.sys.readDirectory,
        readFile: ts.sys.readFile,
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            throw new Error(ts.formatDiagnostic(diagnostic, diagnosticsHost));
        },
    };
}
