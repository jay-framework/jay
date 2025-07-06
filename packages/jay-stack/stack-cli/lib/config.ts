import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export interface JayConfig {
    devServer?: {
        portRange?: [number, number];
    };
    editorServer?: {
        portRange?: [number, number];
    };
}

const DEFAULT_CONFIG: JayConfig = {
    devServer: {
        portRange: [3000, 3100],
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