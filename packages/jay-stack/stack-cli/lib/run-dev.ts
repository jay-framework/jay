import { startDevServer } from './server';
import { setDevLogger, createDevLogger, type LogLevel } from '@jay-framework/logger';
import { surfaceValidationIssues } from './run-validate';

export async function runDev(
    projectPath: string | undefined,
    options: { verbose?: boolean; quiet?: boolean; testMode?: boolean; timeout?: number },
): Promise<void> {
    const logLevel: LogLevel = options.quiet ? 'silent' : options.verbose ? 'verbose' : 'info';

    setDevLogger(createDevLogger(logLevel));

    // DL#189 — surface jay-html validation errors (e.g. phase-binding mismatches) at dev startup
    // without blocking the server, so the author sees them while iterating.
    if (!options.quiet) {
        // dev keeps serving regardless — the report is advisory so the author can fix iteratively.
        await surfaceValidationIssues(projectPath, { verbose: options.verbose });
    }

    const testMode = options.testMode || options.timeout !== undefined;

    await startDevServer({
        projectPath: projectPath || process.cwd(),
        testMode,
        timeout: options.timeout,
        logLevel,
    });
}
