import { Contract, parseContract } from '../contract';
import {
    analyzeExportedTypes,
    ResolveTsConfigOptions,
} from '@jay-framework/compiler-analyze-exported-types';
import { 
    JayType, 
    WithValidations,
    resolvePluginComponent as resolvePlugin,
    PluginComponentResolution,
} from '@jay-framework/compiler-shared';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export type { PluginComponentResolution };

export interface JayImportResolver {
    resolveLink(importingModuleDir: string, link: string): string;
    loadContract(fullPath: string): WithValidations<Contract>;
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
    resolvePluginComponent(pluginName: string, contractName: string, projectRoot: string): WithValidations<PluginComponentResolution>;
}

export const JAY_IMPORT_RESOLVER: JayImportResolver = {
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
        return analyzeExportedTypes(fullPath, options);
    },
    loadContract(fullPath: string): WithValidations<Contract> {
        const content = fs.readFileSync(fullPath).toString();
        return parseContract(content, fullPath);
    },
    resolveLink(importingModuleDir: string, link: string): string {
        if (link?.[0] === '.') return path.resolve(importingModuleDir, link);
        else return require.resolve(link, { paths: require.resolve.paths(importingModuleDir) });
    },
    resolvePluginComponent(pluginName: string, contractName: string, projectRoot: string): WithValidations<PluginComponentResolution> {
        // Use shared plugin resolution logic from compiler-shared
        // This handles both local plugins (src/plugins/) and NPM packages (node_modules/)
        return resolvePlugin(projectRoot, pluginName, contractName);
    },
};
