/**
 * Jay Framework Logger
 *
 * Centralized logging for all Jay packages. The default implementation
 * uses console methods. CLIs replace this with level-aware implementations.
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'silent' | 'info' | 'verbose';

/**
 * Core logging interface used throughout Jay packages.
 *
 * Log method semantics:
 * - `important()`: Always shown unless silent (startup messages, major events)
 * - `info()`: Only shown in verbose mode (detailed operational info)
 * - `warn()`: Shown unless silent (warnings that don't prevent operation)
 * - `error()`: Always shown (errors that need attention)
 */
export interface JayLogger {
    /** Log important messages - shown in default mode (startup, major events) */
    important: (msg: string) => void;
    /** Log info messages - shown only in verbose mode */
    info: (msg: string) => void;
    /** Log warnings - shown unless silent */
    warn: (msg: string) => void;
    /** Log errors - always shown */
    error: (msg: string) => void;
}

/**
 * Request timing interface for dev server performance tracking.
 */
export interface RequestTiming {
    /** Record Vite SSR module compilation time */
    recordViteSsr: (ms: number) => void;
    /** Record parameter loading time (jay-html parsing, manifest) */
    recordParams: (ms: number) => void;
    /** Record slow render phase time */
    recordSlowRender: (ms: number) => void;
    /** Record fast render phase time */
    recordFastRender: (ms: number) => void;
    /** Record Vite client transform time */
    recordViteClient: (ms: number) => void;
    /** End the request and print final timing line */
    end: () => void;
}

/**
 * Extended logger with request timing support (for dev server).
 */
export interface JayDevLogger extends JayLogger {
    /** Start timing a new request. Returns timing recorder. */
    startRequest: (method: string, path: string) => RequestTiming;
}

// ============================================================================
// Default Implementation
// ============================================================================

/**
 * Default logger using console methods.
 * All log levels enabled - CLIs replace this with level-aware versions.
 */
const defaultLogger: JayLogger = {
    important: (msg) => console.log(msg),
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
};

let currentLogger: JayLogger = defaultLogger;

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current logger instance.
 *
 * @example
 * ```typescript
 * import { getLogger } from '@jay-framework/logger';
 *
 * const log = getLogger();
 * log.info('[MyModule] Starting operation...');
 * log.error('[MyModule] Operation failed!');
 * ```
 */
export function getLogger(): JayLogger {
    return currentLogger;
}

/**
 * Replace the current logger with a custom implementation.
 * Typically called by CLIs at startup to set log level.
 *
 * @example
 * ```typescript
 * import { setLogger, type JayLogger } from '@jay-framework/logger';
 *
 * const cliLogger: JayLogger = {
 *   important: (msg) => console.log(msg),
 *   info: verbose ? (msg) => console.log(msg) : () => {},
 *   warn: quiet ? () => {} : (msg) => console.warn(msg),
 *   error: (msg) => console.error(msg),
 * };
 *
 * setLogger(cliLogger);
 * ```
 */
export function setLogger(logger: JayLogger): void {
    currentLogger = logger;
}

/**
 * Reset to the default console-based logger.
 * Useful for testing.
 */
export function resetLogger(): void {
    currentLogger = defaultLogger;
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a log-level-aware logger.
 * Convenience factory for CLIs.
 *
 * @example
 * ```typescript
 * import { createLogger, setLogger } from '@jay-framework/logger';
 *
 * // From CLI flags
 * const level = quiet ? 'silent' : verbose ? 'verbose' : 'info';
 * setLogger(createLogger(level));
 * ```
 */
export function createLogger(level: LogLevel): JayLogger {
    const isSilent = level === 'silent';
    const isVerbose = level === 'verbose';

    return {
        important: isSilent ? () => {} : (msg) => console.log(msg),
        info: isVerbose ? (msg) => console.log(msg) : () => {},
        warn: isSilent ? () => {} : (msg) => console.warn(msg),
        error: (msg) => console.error(msg),
    };
}

// ============================================================================
// Dev Logger (with timing support)
// ============================================================================

let currentDevLogger: JayDevLogger | undefined;

/**
 * Get the dev logger with timing support.
 * Returns undefined if not set (non-dev-server context).
 */
export function getDevLogger(): JayDevLogger | undefined {
    return currentDevLogger;
}

/**
 * Set the dev logger with timing support.
 * Called by dev server at startup.
 */
export function setDevLogger(logger: JayDevLogger): void {
    currentDevLogger = logger;
    // Also set as the regular logger
    currentLogger = logger;
}

/**
 * Reset the dev logger.
 */
export function resetDevLogger(): void {
    currentDevLogger = undefined;
}

// ============================================================================
// Dev Logger Factory (with timing)
// ============================================================================

interface TimingState {
    method: string;
    path: string;
    startTime: number;
    viteSsr: number;
    params: number;
    slowRender: number;
    fastRender: number;
    viteClient: number;
}

/**
 * Create a dev logger with timing support.
 * Displays request timing in a single updating line.
 *
 * @example
 * ```typescript
 * import { createDevLogger, setDevLogger } from '@jay-framework/logger';
 *
 * const level = quiet ? 'silent' : verbose ? 'verbose' : 'info';
 * setDevLogger(createDevLogger(level));
 * ```
 */
export function createDevLogger(level: LogLevel): JayDevLogger {
    const baseLogger = createLogger(level);
    const isSilent = level === 'silent';
    const isTTY = process.stdout.isTTY;

    function formatTiming(state: TimingState): string {
        const parts: string[] = [];

        if (state.viteSsr > 0) parts.push(`vite-ssr: ${state.viteSsr}ms`);
        if (state.params > 0) parts.push(`params: ${state.params}ms`);
        if (state.slowRender > 0) parts.push(`slow: ${state.slowRender}ms`);
        if (state.fastRender > 0) parts.push(`fast: ${state.fastRender}ms`);
        if (state.viteClient > 0) parts.push(`vite-client: ${state.viteClient}ms`);

        const total = Date.now() - state.startTime;
        const timingStr = parts.length > 0 ? `[${parts.join(' | ')}] ` : '';

        return `${state.method} ${state.path} ${timingStr}${total}ms`;
    }

    function createTiming(method: string, path: string): RequestTiming {
        const state: TimingState = {
            method,
            path,
            startTime: Date.now(),
            viteSsr: 0,
            params: 0,
            slowRender: 0,
            fastRender: 0,
            viteClient: 0,
        };

        // For TTY, we can update the line in place
        let lastLineLength = 0;

        function updateLine(): void {
            if (isSilent) return;

            const line = formatTiming(state);

            if (isTTY) {
                // Clear the line and write new content
                const clearStr = '\r' + ' '.repeat(lastLineLength) + '\r';
                process.stdout.write(clearStr + line);
                lastLineLength = line.length;
            }
            // For non-TTY, we only print at the end
        }

        return {
            recordViteSsr: (ms: number) => {
                state.viteSsr += ms;
                updateLine();
            },
            recordParams: (ms: number) => {
                state.params += ms;
                updateLine();
            },
            recordSlowRender: (ms: number) => {
                state.slowRender += ms;
                updateLine();
            },
            recordFastRender: (ms: number) => {
                state.fastRender += ms;
                updateLine();
            },
            recordViteClient: (ms: number) => {
                state.viteClient += ms;
                updateLine();
            },
            end: () => {
                if (isSilent) return;

                const line = formatTiming(state);

                if (isTTY) {
                    // Clear the updating line and print final with newline
                    const clearStr = '\r' + ' '.repeat(lastLineLength) + '\r';
                    process.stdout.write(clearStr);
                }

                console.log(line);
            },
        };
    }

    return {
        ...baseLogger,
        startRequest: createTiming,
    };
}
