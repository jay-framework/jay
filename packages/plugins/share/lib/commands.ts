/**
 * `jay-stack run share/<cmd>` — human text, exit 0 when the report is ok, 1 otherwise
 * (DL#237: actions are the typed surface; the CLI has no --json).
 */
import {
    makeCliCommand,
    CONSOLE_CONTEXT,
    type ConsoleContext,
} from '@jay-framework/fullstack-component';
import { runShareFlow, type ShareFlowInput, type ShareFlowName } from './flows';
import type { ShareReport } from './core/types';

function shareCommand<Name extends ShareFlowName>(name: Name) {
    return makeCliCommand(name)
        .withServices(CONSOLE_CONTEXT)
        .withHandler(async (input: ShareFlowInput<Name>, console: ConsoleContext) => {
            const report = await runShareFlow(name, console.projectRoot, input);
            printReport(report, console);
            return { success: report.ok };
        });
}

export const publishCommand = shareCommand('publish');
export const linkCommand = shareCommand('link');
export const pullCommand = shareCommand('pull');
export const pushCommand = shareCommand('push');
export const statusCommand = shareCommand('status');
export const restoreCommand = shareCommand('restore');
export const unlinkCommand = shareCommand('unlink');

export function formatReport(report: ShareReport): string[] {
    const lines = [report.ok ? report.message : `${report.code}: ${report.message}`];
    for (const file of report.files) lines.push(`  ${file}`);
    if (report.localSha && report.remoteSha && !report.ok) {
        lines.push(`  local ${report.localSha}  remote ${report.remoteSha}`);
    }
    if (report.plugin) {
        const p = report.plugin;
        lines.push(`  ${p.name} → src/plugins/${p.folder} @ ${p.shortSha}  setup: ${p.setup}`);
        if (p.setupMessage) lines.push(`  ${p.setupMessage}`);
    }
    if (report.incoming?.codeFiles.length) {
        lines.push('  Incoming code files (mention them in the site PR):');
        for (const file of report.incoming.codeFiles) lines.push(`    ${file}`);
    }
    if (report.nextStep) lines.push(`Next: ${report.nextStep}`);
    return lines;
}

function printReport(report: ShareReport, console: ConsoleContext): void {
    const write = report.ok ? console.log : console.error;
    for (const line of formatReport(report)) write(line);
}
