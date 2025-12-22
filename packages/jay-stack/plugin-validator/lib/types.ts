import type { PluginManifest } from '@jay-framework/editor-protocol';

export interface ValidatePluginOptions {
    pluginPath?: string;
    local?: boolean; // Validate src/plugins/ instead of package
    verbose?: boolean;
    strict?: boolean;
    generateTypes?: boolean; // Generate .d.ts files
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    pluginName?: string;
    contractsChecked?: number;
    componentsChecked?: number;
    packageJsonChecked?: boolean;
    typesGenerated?: number;
}

export interface ValidationError {
    type:
        | 'schema'
        | 'file-missing'
        | 'export-mismatch'
        | 'contract-invalid'
        | 'type-generation-failed';
    message: string;
    location?: string;
    suggestion?: string;
}

export interface ValidationWarning {
    type: string;
    message: string;
    location?: string;
    suggestion?: string;
}

export interface PluginContext {
    manifest: PluginManifest;
    pluginPath: string;
    isNpmPackage: boolean;
}

