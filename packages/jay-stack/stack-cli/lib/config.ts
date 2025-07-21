import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export interface JayConfig {
    devServer?: {
        portRange?: [number, number];
        pagesBase?: string;
        componentsBase?: string;
        publicFolder?: string;
    };
    editorServer?: {
        portRange?: [number, number];
        editorId?: string;
    };
}

const DEFAULT_CONFIG: JayConfig = {
    devServer: {
        portRange: [3000, 3100],
        pagesBase: './src/pages',
        componentsBase: './src/components',
        publicFolder: './public',
    },
    editorServer: {
        portRange: [3101, 3200],
    },
};

export function loadConfig(): JayConfig {
    const configPath = path.resolve('.jay');

    if (!fs.existsSync(configPath)) {
        return DEFAULT_CONFIG;
    }

    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const userConfig = YAML.parse(configContent);

        // Merge with defaults, allowing user config to override defaults
        return {
            devServer: {
                ...DEFAULT_CONFIG.devServer,
                ...userConfig.devServer,
            },
            editorServer: {
                ...DEFAULT_CONFIG.editorServer,
                ...userConfig.editorServer,
            },
        };
    } catch (error) {
        console.warn('Failed to parse .jay YAML config file, using defaults:', error);
        return DEFAULT_CONFIG;
    }
}

export function getConfigWithDefaults(config: JayConfig): Required<JayConfig> {
    return {
        devServer: {
            portRange: config.devServer?.portRange || DEFAULT_CONFIG.devServer!.portRange!,
            pagesBase: config.devServer?.pagesBase || DEFAULT_CONFIG.devServer!.pagesBase!,
            componentsBase: config.devServer?.componentsBase || DEFAULT_CONFIG.devServer!.componentsBase!,
            publicFolder: config.devServer?.publicFolder || DEFAULT_CONFIG.devServer!.publicFolder!,
        },
        editorServer: {
            portRange: config.editorServer?.portRange || DEFAULT_CONFIG.editorServer!.portRange!,
            editorId: config.editorServer?.editorId,
        },
    };
}

export function updateConfig(updates: Partial<JayConfig>): void {
    const configPath = path.resolve('.jay');

    try {
        // Load existing config or use defaults
        const existingConfig = loadConfig();

        // Merge updates with existing config
        const updatedConfig = {
            ...existingConfig,
            ...updates,
            devServer: {
                ...existingConfig.devServer,
                ...updates.devServer,
            },
            editorServer: {
                ...existingConfig.editorServer,
                ...updates.editorServer,
            },
        };

        // Write back to file
        const yamlContent = YAML.stringify(updatedConfig, { indent: 2 });
        fs.writeFileSync(configPath, yamlContent);
    } catch (error) {
        console.warn('Failed to update .jay config file:', error);
    }
}
