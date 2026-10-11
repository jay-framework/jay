/**
 * Agent-skills publishing (DL#216).
 *
 * Packages authored skills into the agent-skills-discovery v0.2.0 layout under
 * `public/.well-known/agent-skills/`: a `SKILL.md` per skill (served at the predictable
 * `/.well-known/agent-skills/<name>/SKILL.md`), an optional `.tar.gz` when a skill ships assets,
 * an `index.json` listing every skill with a `digest` = `sha256:<hex>` over the served artifact,
 * and an `api-catalog` linkset advertising the index.
 *
 * This is the "creation tool" half of DL#216's prevention ladder — the author owns the content,
 * this does the mechanical packaging + digests, and the validator (validate-skills.ts) is the
 * tripwire that fails when a `SKILL.md` changed without a re-run (digest drift).
 *
 * NOT a build-time generator: digests only need recomputing when a skill changes, so re-running
 * this command is the fix for staleness — keeping a non-core spec out of the build path (DL#216).
 */
import { promises as fsp, type Dirent } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { writeTarGz, type TarEntry } from './tar.js';

/** Pinned agent-skills-discovery schema (v0.2.0). */
export const AGENT_SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
/** Path (relative to `public/`) of the published agent-skills tree. */
export const AGENT_SKILLS_DIR = path.posix.join('.well-known', 'agent-skills');
/** `SKILL.md` frontmatter name: lowercase, digits, hyphens, 1–64 chars. */
export const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;
/** `SKILL.md` frontmatter description max length. */
export const SKILL_DESCRIPTION_MAX = 1024;

export interface ResolvedSkill {
    name: string;
    description: string;
    /** Full `SKILL.md` text (frontmatter + body). */
    skillMd: string;
    /** Assets bundled into the archive, as POSIX-relative paths + bytes. */
    assets: TarEntry[];
}

export interface SkillIndexEntry {
    name: string;
    type: 'skill-md' | 'archive';
    description: string;
    url: string;
    digest: string;
}

export interface PublishSkillsOptions {
    projectRoot: string;
    /** Absolute path to the project's `public/` folder. */
    publicFolder: string;
    /** Folder-mode source dir (default `<projectRoot>/src/skills`). */
    folder?: string;
    /** Config-mode file (JSON/YAML with a `skills[]` list). Takes precedence over folder mode. */
    config?: string;
    log?: (msg: string) => void;
}

export interface PublishSkillsResult {
    skills: SkillIndexEntry[];
    /** Absolute path of the emitted index.json. */
    indexPath: string;
    /** Absolute path of the emitted api-catalog. */
    apiCatalogPath: string;
}

interface ParsedFrontmatter {
    frontmatter: Record<string, unknown>;
    body: string;
}

/** Split YAML frontmatter from a `SKILL.md` body (same shape as the markdown plugin). */
export function parseFrontmatter(content: string): ParsedFrontmatter {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    const raw = YAML.parse(match[1]);
    return {
        frontmatter: raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {},
        body: match[2],
    };
}

function sha256(buf: Buffer): string {
    return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

function requireValidSkill(
    name: unknown,
    description: unknown,
    where: string,
): {
    name: string;
    description: string;
} {
    if (typeof name !== 'string' || !SKILL_NAME_PATTERN.test(name)) {
        throw new Error(
            `${where}: SKILL.md frontmatter \`name\` must be lowercase letters/digits/hyphens, 1–64 chars (got ${JSON.stringify(name)}).`,
        );
    }
    if (typeof description !== 'string' || description.trim() === '') {
        throw new Error(`${where}: SKILL.md frontmatter \`description\` is required.`);
    }
    if (description.length > SKILL_DESCRIPTION_MAX) {
        throw new Error(
            `${where}: SKILL.md frontmatter \`description\` exceeds ${SKILL_DESCRIPTION_MAX} chars.`,
        );
    }
    return { name, description };
}

async function listFilesRecursive(dir: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(current: string): Promise<void> {
        const entries = await fsp.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile()) out.push(full);
        }
    }
    await walk(dir);
    return out.sort();
}

/** Resolve skills from a folder: each `<folder>/<name>/SKILL.md` is one skill; siblings are assets. */
export async function resolveSkillsFromFolder(folder: string): Promise<ResolvedSkill[]> {
    let entries: Dirent[];
    try {
        entries = await fsp.readdir(folder, { withFileTypes: true });
    } catch {
        return [];
    }

    const skills: ResolvedSkill[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(folder, entry.name);
        const skillMdPath = path.join(dir, 'SKILL.md');
        let skillMd: string;
        try {
            skillMd = await fsp.readFile(skillMdPath, 'utf8');
        } catch {
            continue; // not a skill dir
        }
        const { frontmatter } = parseFrontmatter(skillMd);
        const { name, description } = requireValidSkill(
            frontmatter.name,
            frontmatter.description,
            path.relative(folder, skillMdPath) || skillMdPath,
        );

        const assetPaths = (await listFilesRecursive(dir)).filter((p) => p !== skillMdPath);
        const assets: TarEntry[] = await Promise.all(
            assetPaths.map(async (p) => ({
                name: path.posix.join(...path.relative(dir, p).split(path.sep)),
                content: await fsp.readFile(p),
            })),
        );

        skills.push({ name, description, skillMd, assets });
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
}

interface ConfigSkillEntry {
    name?: string;
    description?: string;
    /** Path to a SKILL.md (relative to the config file), or omit and supply `body`. */
    source?: string;
    /** Inline SKILL.md text (alternative to `source`). */
    body?: string;
    /** Asset paths relative to the config file. */
    assets?: string[];
}

/** Resolve skills from an explicit config file (`{ skills: [...] }`) for curated publishing. */
export async function resolveSkillsFromConfig(configPath: string): Promise<ResolvedSkill[]> {
    const raw = await fsp.readFile(configPath, 'utf8');
    const parsed = YAML.parse(raw);
    const list = parsed?.skills;
    if (!Array.isArray(list)) {
        throw new Error(`${configPath}: expected a top-level \`skills\` array.`);
    }
    const base = path.dirname(configPath);

    const skills: ResolvedSkill[] = [];
    for (let i = 0; i < list.length; i++) {
        const entry = list[i] as ConfigSkillEntry;
        const where = `${path.basename(configPath)} skills[${i}]`;
        let skillMd: string;
        if (typeof entry.body === 'string') {
            skillMd = entry.body;
        } else if (typeof entry.source === 'string') {
            skillMd = await fsp.readFile(path.resolve(base, entry.source), 'utf8');
        } else {
            throw new Error(`${where}: provide either \`source\` or \`body\`.`);
        }

        const { frontmatter } = parseFrontmatter(skillMd);
        const { name, description } = requireValidSkill(
            entry.name ?? frontmatter.name,
            entry.description ?? frontmatter.description,
            where,
        );

        const assets: TarEntry[] = await Promise.all(
            (entry.assets ?? []).map(async (rel) => ({
                name: path.posix.join(...rel.split(path.sep)),
                content: await fsp.readFile(path.resolve(base, rel)),
            })),
        );

        skills.push({ name, description, skillMd, assets });
    }
    return skills;
}

/** Build the `/.well-known/api-catalog` linkset advertising the agent-skills index (RFC 9727 / 9264). */
function buildApiCatalog(existing: string | null): string {
    const indexHref = '/' + path.posix.join(AGENT_SKILLS_DIR, 'index.json');
    const link = { href: indexHref, type: 'application/json' };

    let doc: any = { linkset: [] };
    if (existing) {
        try {
            const parsed = JSON.parse(existing);
            if (parsed && Array.isArray(parsed.linkset)) doc = parsed;
        } catch {
            // malformed existing catalog — replace it
        }
    }

    let context = doc.linkset.find((c: any) => c && c.anchor === '/');
    if (!context) {
        context = { anchor: '/' };
        doc.linkset.push(context);
    }
    context['agent-skills'] = [link];
    return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Publish resolved skills into `public/.well-known/agent-skills/`:
 * writes each `SKILL.md`, a `.tar.gz` for skills with assets, the `index.json` (with fresh
 * `sha256:` digests), and the `api-catalog`. The agent-skills tree is rebuilt from scratch so a
 * skill deleted from source does not linger in the published output.
 */
export async function publishSkills(options: PublishSkillsOptions): Promise<PublishSkillsResult> {
    const log = options.log ?? (() => {});
    const skills = options.config
        ? await resolveSkillsFromConfig(options.config)
        : await resolveSkillsFromFolder(
              options.folder ?? path.join(options.projectRoot, 'src', 'skills'),
          );

    const outDir = path.join(options.publicFolder, AGENT_SKILLS_DIR);
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });

    const entries: SkillIndexEntry[] = [];
    for (const skill of skills) {
        const skillDir = path.join(outDir, skill.name);
        await fsp.mkdir(skillDir, { recursive: true });

        // Always write the human-readable SKILL.md at the predictable path.
        const skillMdBuf = Buffer.from(skill.skillMd, 'utf8');
        await fsp.writeFile(path.join(skillDir, 'SKILL.md'), skillMdBuf);

        if (skill.assets.length > 0) {
            // Assets → package SKILL.md + assets into a .tar.gz; index entry points at the archive.
            const archive = writeTarGz([
                { name: 'SKILL.md', content: skillMdBuf },
                ...skill.assets,
            ]);
            const archiveName = `${skill.name}.tar.gz`;
            await fsp.writeFile(path.join(skillDir, archiveName), archive);
            entries.push({
                name: skill.name,
                type: 'archive',
                description: skill.description,
                url: '/' + path.posix.join(AGENT_SKILLS_DIR, skill.name, archiveName),
                digest: sha256(archive),
            });
        } else {
            entries.push({
                name: skill.name,
                type: 'skill-md',
                description: skill.description,
                url: '/' + path.posix.join(AGENT_SKILLS_DIR, skill.name, 'SKILL.md'),
                digest: sha256(skillMdBuf),
            });
        }
        log(`  published skill "${skill.name}" (${entries[entries.length - 1].type})`);
    }

    const index = { $schema: AGENT_SKILLS_SCHEMA, skills: entries };
    const indexPath = path.join(outDir, 'index.json');
    await fsp.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

    const apiCatalogPath = path.join(options.publicFolder, '.well-known', 'api-catalog');
    let existing: string | null = null;
    try {
        existing = await fsp.readFile(apiCatalogPath, 'utf8');
    } catch {
        // none yet
    }
    await fsp.writeFile(apiCatalogPath, buildApiCatalog(existing));

    log(`Published ${entries.length} skill(s) to ${AGENT_SKILLS_DIR}/index.json`);
    return { skills: entries, indexPath, apiCatalogPath };
}
