// rollup-plugin-jay.js
import { merge } from 'lodash';
import { generateElementFile } from 'jay-compiler';
import * as ts from 'typescript';
import path from 'path';
import * as fs from 'fs';
import { TransformResult } from 'rollup';

const JAY_TS_CONFIG_OVERRIDE = { compilerOptions: { noEmit: false } };

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
    const tsConfigPath = resolveTsConfig(options);
    const tsConfig = tsConfigPath ? readTsConfigFile(tsConfigPath) : {};
    const jayTsConfig = merge(tsConfig, JAY_TS_CONFIG_OVERRIDE);
    return {
        name: 'jay', // this name will show up in warnings and errors
        transform(code: string, id: string): TransformResult {
            if (id.endsWith('.jay.html') && !id.startsWith('.jay.html')) {
                if (!tsConfigPath) throw new Error('Unable to resolve typescript config path');
                const filename = path.basename(id).replace('.jay.html', '');
                const dirName = path.dirname(id);
                const tsCode = generateElementFile(code, filename, dirName);
                if (tsCode.validations.length > 0) {
                    if (code.length === 0) throw new Error('Empty code');
                    throw new Error(tsCode.validations.join('\n'));
                }
                let jsCode = ts.transpileModule(tsCode.val, jayTsConfig);
                return { code: jsCode.outputText, map: null };
            } else {
                return { code, map: null };
            }
        },
    };
}
