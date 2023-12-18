import path from 'path';
import ts from 'typescript';

export interface ResolveTsConfigOptions {
    relativePath?: string;
}

export function resolveTsConfig(options: ResolveTsConfigOptions) {
    const tsConfigPath = path.resolve(process.cwd(), options.relativePath || 'tsconfig.json');
    if (!ts.sys.fileExists(tsConfigPath)) {
        if (options.relativePath) {
            // If an explicit path was provided but no file was found, throw
            throw new Error(`Could not find specified tsconfig.json at ${tsConfigPath}`);
        } else {
            return null;
        }
    }
    return tsConfigPath;
}
