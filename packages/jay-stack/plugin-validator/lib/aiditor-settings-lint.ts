/**
 * AIditor Project settings contribution schema (materialized YAML).
 * Source of truth for plugin-validator and AIditor runtime discovery.
 */

export type AiditorSettingsRequire = {
    plugin: string;
    status: 'configured';
};

export type AiditorSettingsFile = {
    label: string;
    route: string;
    pluginName?: string;
    requires?: AiditorSettingsRequire[];
};

export type AiditorSettingsValidationError = {
    path: string;
    message: string;
    code?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequires(
    raw: unknown,
    filePath: string,
): { requires: AiditorSettingsRequire[]; errors: AiditorSettingsValidationError[] } {
    const errors: AiditorSettingsValidationError[] = [];
    if (raw === undefined) {
        return { requires: [], errors };
    }
    if (!Array.isArray(raw)) {
        errors.push({
            path: `${filePath}.requires`,
            message: 'requires must be an array',
            code: 'settings-requires-type',
        });
        return { requires: [], errors };
    }

    const requires: AiditorSettingsRequire[] = [];
    raw.forEach((entry, index) => {
        if (!isRecord(entry)) {
            errors.push({
                path: `${filePath}.requires[${index}]`,
                message: 'require entry must be an object',
                code: 'settings-require-shape',
            });
            return;
        }
        if (typeof entry.plugin !== 'string' || !entry.plugin.trim()) {
            errors.push({
                path: `${filePath}.requires[${index}].plugin`,
                message: 'plugin is required',
                code: 'settings-require-plugin',
            });
            return;
        }
        if (entry.status !== 'configured') {
            errors.push({
                path: `${filePath}.requires[${index}].status`,
                message: 'status must be "configured"',
                code: 'settings-require-status',
            });
            return;
        }
        requires.push({ plugin: entry.plugin.trim(), status: 'configured' });
    });

    return { requires, errors };
}

export function validateAiditorSettingsFile(
    raw: unknown,
    sourcePath: string,
): { file?: AiditorSettingsFile; errors: AiditorSettingsValidationError[] } {
    const errors: AiditorSettingsValidationError[] = [];

    if (!isRecord(raw)) {
        return {
            errors: [
                {
                    path: sourcePath,
                    message: 'settings file must be a YAML object',
                    code: 'settings-root-type',
                },
            ],
        };
    }

    if (typeof raw.label !== 'string' || !raw.label.trim()) {
        errors.push({
            path: `${sourcePath}.label`,
            message: 'label is required',
            code: 'settings-label',
        });
    }

    if (typeof raw.route !== 'string' || !raw.route.trim()) {
        errors.push({
            path: `${sourcePath}.route`,
            message: 'route is required',
            code: 'settings-route',
        });
    } else if (!raw.route.startsWith('/')) {
        errors.push({
            path: `${sourcePath}.route`,
            message: 'route must start with /',
            code: 'settings-route-format',
        });
    }

    if (raw.pluginName !== undefined && typeof raw.pluginName !== 'string') {
        errors.push({
            path: `${sourcePath}.pluginName`,
            message: 'pluginName must be a string',
            code: 'settings-plugin-name-type',
        });
    }

    const { requires, errors: requireErrors } = parseRequires(raw.requires, sourcePath);
    errors.push(...requireErrors);

    if (errors.length > 0) {
        return { errors };
    }

    return {
        file: {
            label: (raw.label as string).trim(),
            route: (raw.route as string).trim(),
            ...(typeof raw.pluginName === 'string' && raw.pluginName.trim()
                ? { pluginName: raw.pluginName.trim() }
                : {}),
            ...(requires.length > 0 ? { requires } : {}),
        },
        errors: [],
    };
}
