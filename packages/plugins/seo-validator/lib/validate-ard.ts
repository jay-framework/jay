import path from 'path';
import { promises as fsp } from 'fs';

/**
 * ARD (Agentic Resource Discovery) validation — DL#214.
 *
 * `/.well-known/ard.json` is **author/agent responsibility** (not generated): the framework's job
 * is a presence nudge + a correctness check against the pinned ARD v0.91 "Proposal" shape
 * (https://agenticresourcediscovery.org/spec). Canonical path is `ard.json`; the predecessor
 * `ai-catalog.json` is served as an alias (a plain copy), so validation treats `ard.json` as the
 * source of truth and warns when only the alias is present or the two differ.
 *
 * We validate the shape structurally rather than bundling a JSON Schema + validator dependency —
 * v0.91 is a moving target, and the required/`oneOf` rules are small and explicit here.
 */

export interface ArdFinding {
    message: string;
    severity: 'error' | 'warning';
    suggestion?: string;
}

/** `urn:air:<publisher>:<namespace>:<name>` — the ARD entry identifier pattern. */
const URN_PATTERN = /^urn:air:[^:\s]+:[^:\s]+:[^:\s]+$/;
/** A loose IANA media-type check (e.g. `application/mcp-server-card+json`). */
const MEDIA_TYPE_PATTERN = /^[a-z]+\/[A-Za-z0-9.+-]+$/;

const ARD_SUGGEST = 'See developer/seo-guide.md (ARD v0.91) for the schema and a worked example.';

/** Validate a parsed ARD document (`{ entries: ArdEntry[] }`). Returns structural findings. */
export function validateArdDocument(doc: unknown): ArdFinding[] {
    const findings: ArdFinding[] = [];

    if (!doc || typeof doc !== 'object') {
        return [
            {
                message: 'ard.json must be a JSON object with an `entries` array.',
                severity: 'error',
                suggestion: ARD_SUGGEST,
            },
        ];
    }

    const entries = (doc as any).entries;
    if (!Array.isArray(entries)) {
        return [
            {
                message: 'ard.json is missing the required `entries` array.',
                severity: 'error',
                suggestion: ARD_SUGGEST,
            },
        ];
    }

    entries.forEach((entry: any, i: number) => {
        const at = `ard.json entries[${i}]`;
        if (!entry || typeof entry !== 'object') {
            findings.push({ message: `${at} must be an object.`, severity: 'error' });
            return;
        }

        if (typeof entry.identifier !== 'string' || !URN_PATTERN.test(entry.identifier)) {
            findings.push({
                message: `${at}.identifier must match urn:air:<publisher>:<namespace>:<name>.`,
                severity: 'error',
                suggestion: ARD_SUGGEST,
            });
        }
        if (typeof entry.displayName !== 'string' || entry.displayName.trim() === '') {
            findings.push({
                message: `${at}.displayName is required.`,
                severity: 'error',
            });
        }
        if (typeof entry.type !== 'string' || !MEDIA_TYPE_PATTERN.test(entry.type)) {
            findings.push({
                message: `${at}.type must be an IANA media type (e.g. application/mcp-server-card+json).`,
                severity: 'error',
            });
        }

        const hasUrl = entry.url !== undefined;
        const hasData = entry.data !== undefined;
        if (hasUrl === hasData) {
            findings.push({
                message: `${at} must have exactly one of \`url\` or \`data\`.`,
                severity: 'error',
            });
        }

        // representativeQueries is a SHOULD (2–5) — agents rely on it for semantic discovery.
        const rq = entry.representativeQueries;
        if (rq === undefined) {
            findings.push({
                message: `${at} is missing representativeQueries (2–5 recommended) — agents may not surface this resource.`,
                severity: 'warning',
                suggestion: ARD_SUGGEST,
            });
        } else if (!Array.isArray(rq) || rq.length < 2 || rq.length > 5) {
            findings.push({
                message: `${at}.representativeQueries should list 2–5 example queries.`,
                severity: 'warning',
            });
        }
    });

    return findings;
}

export interface ArdCheckResult {
    findings: ArdFinding[];
    /** True when neither ard.json nor the ai-catalog.json alias exists. */
    absent: boolean;
}

/**
 * Check a project's `public/.well-known/` for ard.json (canonical) + ai-catalog.json (alias):
 *  - neither present → `absent: true` (caller emits the presence nudge),
 *  - ard.json present → parse + structurally validate it,
 *  - only ai-catalog.json present → warn to add/rename to ard.json, but still validate it,
 *  - both present but differing → warn (they should be copies).
 */
export async function checkArdFiles(projectRoot: string): Promise<ArdCheckResult> {
    const wellKnown = path.resolve(projectRoot, 'public/.well-known');
    const ardPath = path.join(wellKnown, 'ard.json');
    const aliasPath = path.join(wellKnown, 'ai-catalog.json');

    const ardRaw = await readIfExists(ardPath);
    const aliasRaw = await readIfExists(aliasPath);

    if (ardRaw === null && aliasRaw === null) {
        return { findings: [], absent: true };
    }

    const findings: ArdFinding[] = [];

    if (ardRaw === null && aliasRaw !== null) {
        findings.push({
            message:
                'Only public/.well-known/ai-catalog.json found — ARD renamed this to ard.json. Add ard.json (keep ai-catalog.json as a copy for older clients).',
            severity: 'warning',
            suggestion: ARD_SUGGEST,
        });
    } else if (ardRaw !== null && aliasRaw !== null && ardRaw.trim() !== aliasRaw.trim()) {
        findings.push({
            message:
                'public/.well-known/ard.json and ai-catalog.json differ — the alias should be a copy of ard.json.',
            severity: 'warning',
        });
    }

    // Validate whichever canonical content we have (prefer ard.json, else the alias).
    const canonicalRaw = ardRaw ?? aliasRaw!;
    let parsed: unknown;
    try {
        parsed = JSON.parse(canonicalRaw);
    } catch (e: any) {
        findings.push({
            message: `${ardRaw !== null ? 'ard.json' : 'ai-catalog.json'} is not valid JSON: ${e.message}`,
            severity: 'error',
        });
        return { findings, absent: false };
    }

    findings.push(...validateArdDocument(parsed));
    return { findings, absent: false };
}

async function readIfExists(p: string): Promise<string | null> {
    try {
        return await fsp.readFile(p, 'utf8');
    } catch {
        return null;
    }
}
