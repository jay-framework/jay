import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { getLogger } from '@jay-framework/logger';

export interface JayConfig {
    devServer?: {
        portRange?: [number, number];
        pagesBase?: string;
        componentsBase?: string;
        publicFolder?: string;
        configBase?: string;
    };
    site?: {
        baseUrl?: string;
    };
}

const DEFAULT_CONFIG: JayConfig = {
    devServer: {
        portRange: [3000, 3100],
        pagesBase: './src/pages',
        componentsBase: './src/components',
        publicFolder: './public',
        configBase: './config',
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

        return {
            devServer: {
                ...DEFAULT_CONFIG.devServer,
                ...userConfig.devServer,
            },
            site: userConfig.site,
        };
    } catch (error) {
        getLogger().warn(`Failed to parse .jay YAML config file, using defaults: ${error}`);
        return DEFAULT_CONFIG;
    }
}

export function getConfigWithDefaults(
    config: JayConfig,
): Required<Pick<JayConfig, 'devServer'>> & Pick<JayConfig, 'site'> {
    return {
        devServer: {
            portRange: config.devServer?.portRange || DEFAULT_CONFIG.devServer!.portRange!,
            pagesBase: config.devServer?.pagesBase || DEFAULT_CONFIG.devServer!.pagesBase!,
            componentsBase:
                config.devServer?.componentsBase || DEFAULT_CONFIG.devServer!.componentsBase!,
            publicFolder: config.devServer?.publicFolder || DEFAULT_CONFIG.devServer!.publicFolder!,
            configBase: config.devServer?.configBase || DEFAULT_CONFIG.devServer!.configBase!,
        },
        site: config.site,
    };
}

export function updateConfig(updates: Partial<JayConfig>): void {
    const configPath = path.resolve('.jay');

    try {
        const existingConfig = loadConfig();

        const updatedConfig = {
            ...existingConfig,
            ...updates,
            devServer: {
                ...existingConfig.devServer,
                ...updates.devServer,
            },
            site: {
                ...existingConfig.site,
                ...updates.site,
            },
        };

        const yamlContent = YAML.stringify(updatedConfig, { indent: 2 });
        fs.writeFileSync(configPath, yamlContent);
    } catch (error) {
        getLogger().warn(`Failed to update .jay config file: ${error}`);
    }
}
