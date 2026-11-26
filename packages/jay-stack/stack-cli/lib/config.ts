import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { getLogger } from '@jay-framework/logger';
import { DEFAULT_ACTION_BODY_LIMIT_BYTES } from '@jay-framework/stack-server-runtime';

export interface JayConfig {
    devServer?: {
        portRange?: [number, number];
        pagesBase?: string;
        componentsBase?: string;
        publicFolder?: string;
        configBase?: string;
        /**
         * Hosts the dev server's Vite host-check accepts, beyond localhost. Use Vite's host-suffix
         * syntax (`.example.dev` matches any subdomain), or `true` to disable the check entirely
         * (dev only — e.g. cloud preview sandboxes). Absent → Vite's localhost-only default.
         * Env override: `JAY_DEV_SERVER_ALLOWED_HOSTS` (comma-separated, or `true`) — replaces, not
         * merges (DL#240, was a merge under DL#220).
         */
        allowedHosts?: string[] | true;
        /**
         * Inject source-editing dev markers (`jay-dev-src` / `jay-dev-item`) so the source-editing
         * inspector can map a rendered pixel back to its jay-html source (DL#219). Off by default —
         * the markers change rendered output, so enable only for AIditor / source-editing sessions.
         */
        sourceEditing?: boolean;
        /**
         * Public base URL path the dev server mounts under (DL#240). Default `/`.
         * Env override: `JAY_DEV_SERVER_BASE`.
         */
        base?: string;
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
    /** Runtime settings for both `jay-stack dev` and `jay-stack serve` (DL#234). */
    server?: {
        /** Cap on a JSON action request body in UTF-8 bytes (positive integer; default 1 MiB). */
        actionBodyLimitBytes?: number;
        /**
         * Switch an action to polling after this many ms (DL#239): the dispatcher races the handler
         * against this budget and, if it is exceeded, answers `202` + a ticket the client polls.
         * Absent → polling off. A positive integer well under the upstream gateway's limit (a poll
         * also waits up to the budget); 25000 is the recommended value behind a 55 s gateway. Enable
         * only on a single-process deployment (see the devops guide); not for fetch-handler platforms
         * or multi-instance.
         */
        actionPollAfterMs?: number;
        /**
         * Max time (ms) a request waits for the refresh of an `expired` instance before serving the
         * stored data (DL#226). Default 2000. Env override: `JAY_SERVER_STALE_WAIT_MS`.
         */
        staleWaitMs?: number;
        /**
         * Max time (ms) a render-on-miss waits before answering 503 (DL#227). Default 8000.
         * Env override: `JAY_SERVER_MISS_TIMEOUT_MS`.
         */
        missTimeoutMs?: number;
        /**
         * Max concurrent slow renders (refresh + render-on-miss) across instances (DL#227).
         * Default 5. Env override: `JAY_SERVER_SLOW_RENDER_CONCURRENCY`.
         */
        slowRenderConcurrency?: number;
        /**
         * Emit the `jay-freshness` response header (DL#226). Default `true`; set `false` to omit it.
         * Env override: `JAY_SERVER_FRESHNESS_HEADER` (`on`/`off`).
         */
        freshnessHeader?: boolean;
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

// ─── Environment-variable overrides (DL#240) ────────────────────────────────
//
// One mechanism — env vars — overrides any `.jay` setting at runtime, so deployment environments
// (jay-ci, jay-dev-machine) override without editing the git-managed `.jay` file. Precedence:
//   programmatic override (tests/CLI) → env var → `.jay` file → built-in default.
// The registry below is the single source of truth for what is overridable; every leaf of
// `JayConfig` has exactly one row (asserted by config.test.ts). A parser returning `undefined`
// means the value was invalid — it is warned and ignored (falls through to `.jay`/default), so a
// malformed pod env never takes the server down.

type ConfigValue = string | number | boolean | string[] | [number, number] | true;

interface OverrideEntry {
    /** Env variable name, e.g. `JAY_SERVER_ACTION_BODY_LIMIT_BYTES`. */
    env: string;
    /** Path into `JayConfig`, e.g. `['server', 'actionBodyLimitBytes']`. */
    path: string[];
    /** Parse the raw env string; `undefined` → invalid → warn + ignore. */
    parse: (raw: string) => ConfigValue | undefined;
}

function parsePositiveInt(raw: string): number | undefined {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseNonNegativeInt(raw: string): number | undefined {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseOnOff(raw: string): boolean | undefined {
    const v = raw.trim().toLowerCase();
    if (v === 'on' || v === 'true' || v === '1') return true;
    if (v === 'off' || v === 'false' || v === '0') return false;
    return undefined;
}

function parseNonEmptyString(raw: string): string | undefined {
    return raw.trim() ? raw : undefined;
}

function parseCsvList(raw: string): string[] | undefined {
    const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return list.length ? list : undefined;
}

function parseHostsOrTrue(raw: string): string[] | true | undefined {
    if (raw.trim().toLowerCase() === 'true') return true;
    return parseCsvList(raw);
}

function parseIntPair(raw: string): [number, number] | undefined {
    const parts = raw.split(',').map((s) => Number(s.trim()));
    if (parts.length !== 2 || !parts.every((n) => Number.isInteger(n) && n > 0)) return undefined;
    return [parts[0], parts[1]];
}

export const ENV_OVERRIDES: OverrideEntry[] = [
    // devServer.*
    { env: 'JAY_DEV_SERVER_PORT_RANGE', path: ['devServer', 'portRange'], parse: parseIntPair },
    {
        env: 'JAY_DEV_SERVER_PAGES_BASE',
        path: ['devServer', 'pagesBase'],
        parse: parseNonEmptyString,
    },
    {
        env: 'JAY_DEV_SERVER_COMPONENTS_BASE',
        path: ['devServer', 'componentsBase'],
        parse: parseNonEmptyString,
    },
    {
        env: 'JAY_DEV_SERVER_PUBLIC_FOLDER',
        path: ['devServer', 'publicFolder'],
        parse: parseNonEmptyString,
    },
    {
        env: 'JAY_DEV_SERVER_CONFIG_BASE',
        path: ['devServer', 'configBase'],
        parse: parseNonEmptyString,
    },
    {
        env: 'JAY_DEV_SERVER_ALLOWED_HOSTS',
        path: ['devServer', 'allowedHosts'],
        parse: parseHostsOrTrue,
    },
    {
        env: 'JAY_DEV_SERVER_SOURCE_EDITING',
        path: ['devServer', 'sourceEditing'],
        parse: parseOnOff,
    },
    { env: 'JAY_DEV_SERVER_BASE', path: ['devServer', 'base'], parse: parseNonEmptyString },
    // site.*
    { env: 'JAY_SITE_BASE_URL', path: ['site', 'baseUrl'], parse: parseNonEmptyString },
    { env: 'JAY_SITE_NAME', path: ['site', 'name'], parse: parseNonEmptyString },
    { env: 'JAY_SITE_LOGO', path: ['site', 'logo'], parse: parseNonEmptyString },
    { env: 'JAY_SITE_DESCRIPTION', path: ['site', 'description'], parse: parseNonEmptyString },
    { env: 'JAY_SITE_SAME_AS', path: ['site', 'sameAs'], parse: parseCsvList },
    // server.*
    {
        env: 'JAY_SERVER_ACTION_BODY_LIMIT_BYTES',
        path: ['server', 'actionBodyLimitBytes'],
        parse: parsePositiveInt,
    },
    {
        env: 'JAY_SERVER_ACTION_POLL_AFTER_MS',
        path: ['server', 'actionPollAfterMs'],
        parse: parsePositiveInt,
    },
    {
        env: 'JAY_SERVER_STALE_WAIT_MS',
        path: ['server', 'staleWaitMs'],
        parse: parseNonNegativeInt,
    },
    {
        env: 'JAY_SERVER_MISS_TIMEOUT_MS',
        path: ['server', 'missTimeoutMs'],
        parse: parsePositiveInt,
    },
    {
        env: 'JAY_SERVER_SLOW_RENDER_CONCURRENCY',
        path: ['server', 'slowRenderConcurrency'],
        parse: parsePositiveInt,
    },
    {
        env: 'JAY_SERVER_FRESHNESS_HEADER',
        path: ['server', 'freshnessHeader'],
        parse: parseOnOff,
    },
    // validations.*
    {
        env: 'JAY_VALIDATIONS_ALLOW_NO_ARD',
        path: ['validations', 'allow-no-ard'],
        parse: parseOnOff,
    },
    {
        env: 'JAY_VALIDATIONS_ALLOW_NO_ERROR_PAGES',
        path: ['validations', 'allow-no-error-pages'],
        parse: parseOnOff,
    },
];

function setAtPath(target: Record<string, any>, path: string[], value: ConfigValue): void {
    let node = target;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
        node = node[key];
    }
    node[path[path.length - 1]] = value;
}

/**
 * Apply `JAY_*` environment overrides onto a loaded config, in place (DL#240). Env wins over `.jay`;
 * invalid values are warned and ignored. Exported for testing. `env` defaults to `process.env`.
 */
export function applyEnvOverrides(
    config: JayConfig,
    env: NodeJS.ProcessEnv = process.env,
): JayConfig {
    for (const { env: name, path: configPath, parse } of ENV_OVERRIDES) {
        const raw = env[name];
        if (raw === undefined) continue;
        const value = parse(raw);
        if (value === undefined) {
            getLogger().warn(`Ignoring invalid ${name}=${raw}; using .jay value or default`);
            continue;
        }
        setAtPath(config as Record<string, any>, configPath, value);
    }
    return config;
}

export function loadConfig(projectRoot?: string): JayConfig {
    const configPath = projectRoot ? path.resolve(projectRoot, '.jay') : path.resolve('.jay');

    let base: JayConfig;
    if (!fs.existsSync(configPath)) {
        // Clone so env overrides never mutate the shared DEFAULT_CONFIG singleton.
        base = { devServer: { ...DEFAULT_CONFIG.devServer } };
    } else {
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const userConfig = YAML.parse(configContent) ?? {};
            base = {
                devServer: {
                    ...DEFAULT_CONFIG.devServer,
                    ...userConfig.devServer,
                },
                site: userConfig.site,
                server: userConfig.server,
                validations: userConfig.validations,
            };
        } catch (error) {
            getLogger().warn(`Failed to parse .jay YAML config file, using defaults: ${error}`);
            base = { devServer: { ...DEFAULT_CONFIG.devServer } };
        }
    }

    // Env overrides apply on every path — even with no `.jay` file (DL#240), so a pod can configure
    // a project that ships no committed config.
    return applyEnvOverrides(base);
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
            // No default — absent means Vite's localhost-only host check (DL#220).
            allowedHosts: config.devServer?.allowedHosts,
            // Default off — source-editing markers (DL#219) only for opt-in sessions.
            sourceEditing: config.devServer?.sourceEditing,
            // No default here — consumer falls back to '/' (DL#240).
            base: config.devServer?.base,
        },
        site: config.site,
    };
}

/**
 * The action body cap (DL#234): a positive-integer `override` wins, else `.jay`
 * `server.actionBodyLimitBytes` when a positive integer, else the 1 MiB default.
 */
export function resolveActionBodyLimitBytes(config: JayConfig, override?: number): number {
    if (isPositiveInteger(override)) return override;
    const configured = config.server?.actionBodyLimitBytes;
    if (isPositiveInteger(configured)) return configured;
    return DEFAULT_ACTION_BODY_LIMIT_BYTES;
}

export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * The long-request poll budget (DL#239): `.jay` `server.actionPollAfterMs` when a positive integer,
 * else `undefined` (polling off). A positive-integer `override` wins (used by tests/CLI flags).
 */
export function resolveActionPollAfterMs(config: JayConfig, override?: number): number | undefined {
    if (isPositiveInteger(override)) return override;
    const configured = config.server?.actionPollAfterMs;
    if (isPositiveInteger(configured)) return configured;
    return undefined;
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
