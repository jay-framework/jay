import { Contract, parseContract } from '../contract';
import { analyzeExportedTypes, ResolveTsConfigOptions } from 'jay-compiler-analyze-exported-types';
import { JayType, WithValidations } from 'jay-compiler-shared';
import fs from 'node:fs';
import path from 'path';

export interface JayImportResolver {
    resolveLink(importingModule: string, link: string): string;
    loadContract(fullPath: string): WithValidations<Contract>;
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
}

export const JAY_IMPORT_RESOLVER: JayImportResolver = {
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
        return analyzeExportedTypes(fullPath, options);
    },
    loadContract(fullPath: string): WithValidations<Contract> {
        const content = fs.readFileSync(fullPath).toString();
        return parseContract(content, fullPath);
    },
    resolveLink(importingModule: string, link: string): string {
        return require.resolve(link, { paths: require.resolve.paths(importingModule) });
    },
};
