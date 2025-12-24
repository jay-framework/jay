import type { PluginManifest } from '@jay-framework/editor-protocol';

// Extended types for the new plugin manifest structure
// (These should match what's in editor-protocol but are included here to avoid build dependency issues)
export interface ExtendedPluginManifest extends PluginManifest {
    pages?: PluginPageDef[];
    components?: PluginComponentDef[];
}

export interface PluginPageDef {
    name: string;
    contract: string;
    component: string;
    slugs?: string[];
    description?: string;
}

export interface PluginComponentDef {
    name: string;
    contract: string;
    component: string;
    description?: string;
}

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
    manifest: ExtendedPluginManifest;
    pluginPath: string;
    isNpmPackage: boolean;
}

