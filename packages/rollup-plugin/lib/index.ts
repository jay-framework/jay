import { generateElementFile } from 'jay-compiler';
import * as ts from 'typescript';
import path from 'path';
import * as fs from 'fs';
// rollup-plugin-my-example.js

function readTsConfigFile(tsConfigPath) {
    const { config, error } = ts.readConfigFile(tsConfigPath, (path) =>
        fs.readFileSync(path, 'utf8'),
    );
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

export default function jayCompiler(options = {}) {
    let tsConfigPath = resolveTsConfig(options);
    let tsConfig = tsConfigPath ? readTsConfigFile(tsConfigPath) : {};
    return {
        name: 'jay', // this name will show up in warnings and errors
        transform(code: string, id: string) {
            try {
                if (id.indexOf('.jay.html') > -1) {
                    let filename = path.basename(id).replace('.jay.html', '');
                    let dirName = path.dirname(id);
                    let tsCode = generateElementFile(code, filename, dirName);
                    if (tsCode.validations.length > 0) {
                        console.error(
                            'failed to run Jay Rollup Plugin for file ' +
                                id +
                                '\n' +
                                tsCode.validations.join('\n'),
                        );
                    }
                    let jsCode = ts.transpileModule(tsCode.val, tsConfig);
                    return jsCode.outputText;
                } else {
                    return code;
                }
            } catch (e) {
                console.error('failed to run Jay Rollup Plugin for file ' + id + '\n' + e.message);
                throw e;
            }
        },
    };
}
