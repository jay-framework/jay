import { startDevServer } from './server';
import { setDevLogger, createDevLogger, type LogLevel } from '@jay-framework/logger';

export async function runDev(
    projectPath: string | undefined,
    options: { verbose?: boolean; quiet?: boolean; testMode?: boolean; timeout?: number },
): Promise<void> {
    const logLevel: LogLevel = options.quiet ? 'silent' : options.verbose ? 'verbose' : 'info';

    setDevLogger(createDevLogger(logLevel));

    const testMode = options.testMode || options.timeout !== undefined;

    await startDevServer({
        projectPath: projectPath || process.cwd(),
        testMode,
        timeout: options.timeout,
        logLevel,
    });
}
