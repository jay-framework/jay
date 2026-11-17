/**
 * `share` plugin validator (DL#221 Phase 1a, DL#145 hook). The checks are project-level, but the
 * only plugin→validate channel is the per-page hook, so — as in DL#216 — the scan runs once per
 * `projectRoot` and later pages return nothing. Zero-page projects get no findings (`share/status`
 * covers them).
 */
import type { JayHtmlValidatorFn } from '@jay-framework/compiler-shared';
import { createGitRunner } from '../core/git-runner';
import { checkShareHygiene } from './share-hygiene';

const checkedProjects = new Set<string>();

export const validateShare: JayHtmlValidatorFn = async (ctx) => {
    if (checkedProjects.has(ctx.projectRoot)) return [];
    checkedProjects.add(ctx.projectRoot);
    const findings = await checkShareHygiene(ctx.projectRoot, createGitRunner());
    return findings.map(({ severity, message, suggestion }) => ({ severity, message, suggestion }));
};
