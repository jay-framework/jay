/**
 * Utilities for handling Jay environment metadata in module specifiers.
 *
 * Jay uses query parameters to pass environment information through the import chain:
 * - `?jay-client` / `?jay-server` - Client/server code splitting
 * - `?jay-mainSandbox` / `?jay-workerTrusted` / `?jay-workerSandbox` - Security sandbox modes
 *
 * These utilities provide a consistent way to parse, add, and detect these parameters
 * while correctly handling file extensions like `.jay-contract` and `.jay-html`.
 */

import { RuntimeMode, JAY_QUERY_PREFIX, TS_EXTENSION, TSX_EXTENSION } from './runtime-mode';

/**
 * Environment types for Jay code splitting
 */
export enum JayBuildEnvironment {
    Client = 'client',
    Server = 'server',
}

/**
 * All possible Jay environment query parameter values
 */
export type JayEnvironment = JayBuildEnvironment | RuntimeMode;

/**
 * Query parameter strings for build environments
 */
export const JAY_QUERY_CLIENT = `${JAY_QUERY_PREFIX}${JayBuildEnvironment.Client}`;
export const JAY_QUERY_SERVER = `${JAY_QUERY_PREFIX}${JayBuildEnvironment.Server}`;

/**
 * Parsed module specifier with environment information separated
 */
export interface ParsedJayModuleSpecifier {
    /** The base path without any jay query parameters */
    basePath: string;
    /** The build environment (client/server) if present */
    buildEnvironment?: JayBuildEnvironment;
    /** The runtime mode (sandbox modes) if present */
    runtimeMode?: RuntimeMode;
    /** Any remaining query parameters (not jay-related) */
    otherQueryParams: string;
    /** The full query string for reconstruction */
    fullQueryString: string;
}

/**
 * All known jay query parameter patterns
 */
const JAY_QUERY_PATTERNS: Array<{
    pattern: string;
    buildEnv?: JayBuildEnvironment;
    runtimeMode?: RuntimeMode;
}> = [
    // Build environments
    {
        pattern: `${JAY_QUERY_PREFIX}${JayBuildEnvironment.Client}`,
        buildEnv: JayBuildEnvironment.Client,
    },
    {
        pattern: `${JAY_QUERY_PREFIX}${JayBuildEnvironment.Server}`,
        buildEnv: JayBuildEnvironment.Server,
    },
    // Runtime modes (with .ts suffix)
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.MainSandbox}${TS_EXTENSION}`,
        runtimeMode: RuntimeMode.MainSandbox,
    },
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerTrusted}${TS_EXTENSION}`,
        runtimeMode: RuntimeMode.WorkerTrusted,
    },
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerSandbox}${TS_EXTENSION}`,
        runtimeMode: RuntimeMode.WorkerSandbox,
    },
    // Runtime modes (without .ts suffix)
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.MainSandbox}`,
        runtimeMode: RuntimeMode.MainSandbox,
    },
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerTrusted}`,
        runtimeMode: RuntimeMode.WorkerTrusted,
    },
    {
        pattern: `${JAY_QUERY_PREFIX}${RuntimeMode.WorkerSandbox}`,
        runtimeMode: RuntimeMode.WorkerSandbox,
    },
];

/**
 * Parse a module specifier to extract the base path and any jay environment information.
 *
 * @example
 * parseJayModuleSpecifier('./component?jay-client')
 * // { basePath: './component', buildEnvironment: 'client', ... }
 *
 * @example
 * parseJayModuleSpecifier('./file.jay-contract?jay-server')
 * // { basePath: './file.jay-contract', buildEnvironment: 'server', ... }
 */
export function parseJayModuleSpecifier(specifier: string): ParsedJayModuleSpecifier {
    const queryIndex = specifier.indexOf('?');

    if (queryIndex === -1) {
        return {
            basePath: specifier,
            otherQueryParams: '',
            fullQueryString: '',
        };
    }

    const basePath = specifier.substring(0, queryIndex);
    const fullQueryString = specifier.substring(queryIndex);

    let buildEnvironment: JayBuildEnvironment | undefined;
    let runtimeMode: RuntimeMode | undefined;
    let remainingQuery = fullQueryString;

    // Extract jay-specific query parameters
    for (const { pattern, buildEnv, runtimeMode: rtMode } of JAY_QUERY_PATTERNS) {
        if (remainingQuery.includes(pattern)) {
            if (buildEnv) buildEnvironment = buildEnv;
            if (rtMode) runtimeMode = rtMode;
            remainingQuery = remainingQuery.replace(pattern, '');
        }
    }

    // Clean up remaining query string
    const otherQueryParams = remainingQuery
        .replace(/^\?&/, '?') // ?& at start -> ?
        .replace(/&&/g, '&') // double && -> &
        .replace(/&$/, '') // trailing &
        .replace(/^\?$/, ''); // just ? -> empty

    return {
        basePath,
        buildEnvironment,
        runtimeMode,
        otherQueryParams,
        fullQueryString,
    };
}

/**
 * Add a build environment (client/server) to a module specifier.
 * If the specifier already has an environment, it will be replaced.
 *
 * @example
 * addBuildEnvironment('./component', 'client')
 * // './component?jay-client'
 *
 * @example
 * addBuildEnvironment('./file?existing=param', 'server')
 * // './file?jay-server&existing=param'
 */
export function addBuildEnvironment(specifier: string, environment: JayBuildEnvironment): string {
    const parsed = parseJayModuleSpecifier(specifier);
    const jayQuery = `${JAY_QUERY_PREFIX}${environment}`;

    // Reconstruct: basePath + jay-env + runtime mode + other params
    let result = parsed.basePath + jayQuery;

    if (parsed.runtimeMode) {
        result += `${JAY_QUERY_PREFIX}${parsed.runtimeMode}`;
    }

    if (parsed.otherQueryParams) {
        // Other params already start with ? or are empty
        if (parsed.otherQueryParams.startsWith('?')) {
            result += '&' + parsed.otherQueryParams.substring(1);
        } else if (parsed.otherQueryParams) {
            result += '&' + parsed.otherQueryParams;
        }
    }

    return result;
}

/**
 * Check if a module specifier has a specific extension, ignoring any query parameters.
 * This is the query-param-aware version of the simple `string.endsWith()` check.
 *
 * Handles cases where .ts/.tsx may appear:
 * - After the extension: `file.jay-html.ts`
 * - After query params: `file.jay-html?jay-mainSandbox.ts`
 * - Before query params: `file.jay-contract.ts?jay-client`
 *
 * @example
 * hasJayExtension('./file.jay-contract?jay-client', '.jay-contract')
 * // true
 *
 * @example
 * hasJayExtension('./file.jay-html?jay-mainSandbox.ts', '.jay-html', { withTs: true })
 * // true
 */
export function hasJayExtension(
    specifier: string,
    extension: string,
    { withTs = false }: { withTs?: boolean } = {},
): boolean {
    // First, strip trailing .ts/.tsx from the full specifier if withTs is true
    // This handles `file.jay-html?query.ts` (ts after query)
    let normalizedSpecifier = specifier;
    if (withTs) {
        if (specifier.endsWith(TS_EXTENSION)) {
            normalizedSpecifier = specifier.slice(0, -TS_EXTENSION.length);
        } else if (specifier.endsWith(TSX_EXTENSION)) {
            normalizedSpecifier = specifier.slice(0, -TSX_EXTENSION.length);
        }
    }

    let { basePath } = parseJayModuleSpecifier(normalizedSpecifier);

    // Also strip .ts/.tsx from the base path if withTs is true
    // This handles `file.jay-contract.ts?query` (ts before query)
    if (withTs) {
        if (basePath.endsWith(TS_EXTENSION)) {
            basePath = basePath.slice(0, -TS_EXTENSION.length);
        } else if (basePath.endsWith(TSX_EXTENSION)) {
            basePath = basePath.slice(0, -TSX_EXTENSION.length);
        }
    }

    // Check if the base path ends with the extension
    return basePath.endsWith(extension) && basePath.length > extension.length;
}

/**
 * Get the base path of a module specifier without any query parameters.
 *
 * @example
 * getBasePath('./component?jay-client')
 * // './component'
 */
export function getBasePath(specifier: string): string {
    return parseJayModuleSpecifier(specifier).basePath;
}

/**
 * Check if a module specifier has a build environment (client or server).
 */
export function hasBuildEnvironment(specifier: string): boolean {
    const { buildEnvironment } = parseJayModuleSpecifier(specifier);
    return buildEnvironment !== undefined;
}

/**
 * Get the build environment from a module specifier, if present.
 */
export function getBuildEnvironment(specifier: string): JayBuildEnvironment | undefined {
    return parseJayModuleSpecifier(specifier).buildEnvironment;
}

/**
 * Check if a module specifier is a local file (relative path).
 */
export function isLocalModule(specifier: string): boolean {
    const { basePath } = parseJayModuleSpecifier(specifier);
    return basePath.startsWith('./') || basePath.startsWith('../');
}
