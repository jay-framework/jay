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
        /** Site/organization name — drives Organization + WebSite JSON-LD (DL#213). */
        name?: string;
        /** Logo URL (absolute or baseUrl-relative) for the Organization JSON-LD (DL#213). */
        logo?: string;
        /** Short site description for the Organization JSON-LD (DL#213). */
        description?: string;
        /** Social/profile URLs for the Organization `sameAs` (DL#213). */
        sameAs?: string[];
    };
    /** Project-wide validation suppressions for project-level concerns (DL#214). */
    validations?: {
        /**
         * Suppress the `/.well-known/ard.json` absence nudge — for sites with no agent-callable
         * resources/APIs to advertise. Lives in `.jay` (not a page's `application/jay-validations`
         * script) because it governs a single project-level file, not any page's markup.
         */
        'allow-no-ard'?: boolean;
        /**
         * Suppress the minimum-error-pages nudge — for sites that intentionally ship no branded
         * `404`/`5xx` pages and accept the plain-text fallback. Lives in `.jay` (not a page's
         * `application/jay-validations` script) because it governs the project's `pages/` tree as a
         * whole, not any single page's markup (DL#218).
         */
        'allow-no-error-pages'?: boolean;
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

export function loadConfig(projectRoot?: string): JayConfig {
    const configPath = projectRoot ? path.resolve(projectRoot, '.jay') : path.resolve('.jay');

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
            validations: userConfig.validations,
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
