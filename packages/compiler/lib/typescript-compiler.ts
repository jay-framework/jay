import * as ts from "typescript";
import fs from "fs";
import path from "path";

function readTsConfigFile(tsConfigPath) {
    const { config, error } = ts.readConfigFile(tsConfigPath, (path) => fs.readFileSync(path, 'utf8'));
    if (error) {
        throw error;
    }
    return config || {};
}

function resolveTsConfig(options) {

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

export function typescriptCompiler(filename: string, options = {}) {
    let tsConfigPath = resolveTsConfig(options);
    let tsConfig = tsConfigPath?readTsConfigFile(tsConfigPath):{};
    let program = ts.createProgram([filename], tsConfig);
    console.log(ts.getPreEmitDiagnostics(program));
//    let compileResult = program.emit();
//     const getSource = (x) => x && x.fileName ? x.fileName : getSource(x.parent)
//
//     let x = program.getTypeCatalog().map(_ => _.symbol && _.symbol.declarations && _.symbol.declarations.length > 0 && _.symbol.declarations[0]?_.symbol.declarations[0]:'')
//         .filter(_ => _ !== '')
//         .map(nodeObject => getSource(nodeObject));

    return program.getTypeCatalog();
}