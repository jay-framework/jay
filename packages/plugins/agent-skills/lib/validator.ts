/**
 * Plugin validator surface (DL#216).
 *
 * The agent-skills check is project-level (it inspects `public/.well-known/agent-skills/`), but the
 * only plugin→validate channel is the per-jay-html `runPluginValidators` hook (DL#145), which calls
 * this once per page. To honour DL#216's "no net-new core" and still report the project check once,
 * we memoize per `projectRoot`: the first page triggers the scan, the rest return nothing.
 *
 * `jay-stack validate` is a one-shot process, so "once per process" == "once per run" there — the
 * shipped path. Each finding names `public/.well-known/agent-skills/…` explicitly so it reads
 * correctly even though the hook attributes it to whichever page ran first. (A dedicated
 * project-level validator hook would improve attribution; see DL#216 Implementation Results.)
 */
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { validateAgentSkills } from './validate-skills.js';

const checkedProjects = new Set<string>();

export const validate: JayHtmlValidatorFn = async (ctx) => {
    if (checkedProjects.has(ctx.projectRoot)) return [];
    checkedProjects.add(ctx.projectRoot);

    const { findings, absent } = await validateAgentSkills(ctx.projectRoot);
    const result: JayHtmlValidationFinding[] = [];

    if (absent) {
        result.push({
            severity: 'warning',
            message:
                'public/.well-known/agent-skills/index.json not found — agents cannot discover this site’s published skills.',
            suggestion:
                'Author skills under src/skills/<name>/SKILL.md and run `jay-stack run agent-skills/publish-skills`. See developer/publish-skills-guide.md.',
        });
    }

    for (const f of findings) {
        result.push({ severity: f.severity, message: f.message, suggestion: f.suggestion });
    }
    return result;
};
