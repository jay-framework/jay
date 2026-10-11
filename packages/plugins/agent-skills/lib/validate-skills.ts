/**
 * Agent-skills validation (DL#216) — the tripwire half of the prevention ladder.
 *
 * Checks the published `public/.well-known/agent-skills/` tree against agent-skills-discovery
 * v0.2.0. The load-bearing check is **digest drift**: each `index.json` entry carries a
 * `digest` = `sha256:<hex>` and a compliant client *refuses* a skill whose refetched bytes don't
 * hash to it — a failure invisible to human review. So a `SKILL.md` edited without re-running the
 * publish tool must fail validation here. Re-running the tool clears it.
 *
 * Project-level (operates on the whole public tree), not per-page — see validator.ts for how it is
 * surfaced through the per-jay-html plugin-validator hook exactly once.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
    AGENT_SKILLS_DIR,
    AGENT_SKILLS_SCHEMA,
    SKILL_DESCRIPTION_MAX,
    SKILL_NAME_PATTERN,
    parseFrontmatter,
} from './publish.js';

export interface SkillsFinding {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
}

const SUGGEST_REPUBLISH =
    'Run `jay-stack run agent-skills/publish-skills` to (re)generate the index + digests. See developer/publish-skills-guide.md.';

async function readIfExists(p: string): Promise<Buffer | null> {
    try {
        return await fsp.readFile(p);
    } catch {
        return null;
    }
}

function sha256(buf: Buffer): string {
    return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

/**
 * Validate a project's published agent-skills tree. Returns `{ findings, absent }`:
 *  - no `index.json` → `absent: true` (caller emits the presence nudge),
 *  - present → schema + per-entry + digest-match checks.
 */
export async function validateAgentSkills(
    projectRoot: string,
): Promise<{ findings: SkillsFinding[]; absent: boolean }> {
    const skillsDir = path.resolve(projectRoot, 'public', AGENT_SKILLS_DIR);
    const indexPath = path.join(skillsDir, 'index.json');
    const indexRaw = await readIfExists(indexPath);

    if (indexRaw === null) {
        return { findings: [], absent: true };
    }

    const findings: SkillsFinding[] = [];

    let doc: any;
    try {
        doc = JSON.parse(indexRaw.toString('utf8'));
    } catch (e: any) {
        return {
            findings: [
                {
                    severity: 'error',
                    message: `agent-skills/index.json is not valid JSON: ${e.message}`,
                    suggestion: SUGGEST_REPUBLISH,
                },
            ],
            absent: false,
        };
    }

    if (doc?.$schema !== AGENT_SKILLS_SCHEMA) {
        findings.push({
            severity: 'error',
            message: `agent-skills/index.json $schema must be "${AGENT_SKILLS_SCHEMA}".`,
            suggestion: SUGGEST_REPUBLISH,
        });
    }

    if (!Array.isArray(doc?.skills)) {
        findings.push({
            severity: 'error',
            message: 'agent-skills/index.json is missing the required `skills` array.',
            suggestion: SUGGEST_REPUBLISH,
        });
        return { findings, absent: false };
    }

    const publicRoot = path.resolve(projectRoot, 'public');
    for (let i = 0; i < doc.skills.length; i++) {
        const entry = doc.skills[i];
        const at = `agent-skills/index.json skills[${i}]`;
        if (!entry || typeof entry !== 'object') {
            findings.push({ severity: 'error', message: `${at} must be an object.` });
            continue;
        }

        if (typeof entry.name !== 'string' || !SKILL_NAME_PATTERN.test(entry.name)) {
            findings.push({
                severity: 'error',
                message: `${at}.name must be lowercase letters/digits/hyphens, 1–64 chars.`,
            });
        }
        if (entry.type !== 'skill-md' && entry.type !== 'archive') {
            findings.push({
                severity: 'error',
                message: `${at}.type must be "skill-md" or "archive".`,
            });
        }
        if (typeof entry.description !== 'string' || entry.description.trim() === '') {
            findings.push({ severity: 'error', message: `${at}.description is required.` });
        }
        if (typeof entry.url !== 'string' || entry.url.trim() === '') {
            findings.push({ severity: 'error', message: `${at}.url is required.` });
        }
        if (typeof entry.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(entry.digest)) {
            findings.push({
                severity: 'error',
                message: `${at}.digest must be "sha256:<64 hex chars>".`,
                suggestion: SUGGEST_REPUBLISH,
            });
        }

        // The drift catcher: refetch the served artifact and compare its hash to the digest.
        if (typeof entry.url === 'string' && typeof entry.digest === 'string') {
            const rel = entry.url.replace(/^\//, '');
            const filePath = path.resolve(publicRoot, rel);
            const bytes = await readIfExists(filePath);
            if (bytes === null) {
                findings.push({
                    severity: 'error',
                    message: `${at}.url points to "${entry.url}" but public${entry.url} does not exist.`,
                    suggestion: SUGGEST_REPUBLISH,
                });
            } else if (
                /^sha256:[0-9a-f]{64}$/.test(entry.digest) &&
                sha256(bytes) !== entry.digest
            ) {
                findings.push({
                    severity: 'error',
                    message: `${at} digest mismatch — ${entry.url} changed since the index was generated (a compliant client will refuse this skill).`,
                    suggestion: SUGGEST_REPUBLISH,
                });
            }
        }

        // For skill-md entries, the referenced file is the SKILL.md — check its frontmatter too.
        if (entry.type === 'skill-md' && typeof entry.url === 'string') {
            const md = await readIfExists(path.resolve(publicRoot, entry.url.replace(/^\//, '')));
            if (md !== null) {
                const { frontmatter } = parseFrontmatter(md.toString('utf8'));
                if (
                    typeof frontmatter.name !== 'string' ||
                    !SKILL_NAME_PATTERN.test(frontmatter.name)
                ) {
                    findings.push({
                        severity: 'error',
                        message: `${at}: SKILL.md frontmatter \`name\` must be lowercase/hyphen, 1–64 chars.`,
                    });
                }
                if (
                    typeof frontmatter.description !== 'string' ||
                    frontmatter.description.trim() === '' ||
                    frontmatter.description.length > SKILL_DESCRIPTION_MAX
                ) {
                    findings.push({
                        severity: 'error',
                        message: `${at}: SKILL.md frontmatter \`description\` is required and ≤${SKILL_DESCRIPTION_MAX} chars.`,
                    });
                }
            }
        }
    }

    // Report-only: advertisement via /.well-known/api-catalog.
    const apiCatalog = await readIfExists(path.join(publicRoot, '.well-known', 'api-catalog'));
    if (apiCatalog === null) {
        findings.push({
            severity: 'warning',
            message:
                'public/.well-known/api-catalog not found — agents discover agent-skills via the api-catalog linkset.',
            suggestion: SUGGEST_REPUBLISH,
        });
    }

    return { findings, absent: false };
}
