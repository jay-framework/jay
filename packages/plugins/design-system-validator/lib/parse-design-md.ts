import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

export interface TypographyToken {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: number;
    lineHeight?: string | number;
    letterSpacing?: string;
}

export interface ComponentSpec {
    [property: string]: string;
}

export interface AnimationPreset {
    duration?: string;
    easing?: string;
}

export interface DesignRules {
    'max-font-weights'?: number;
    'max-primary-buttons'?: number;
    'require-contrast-aa'?: boolean;
}

export interface DesignTokens {
    name?: string;
    colors: Record<string, string>;
    typography: Record<string, TypographyToken>;
    spacing: Record<string, string>;
    rounded: Record<string, string>;
    animations: Record<string, AnimationPreset>;
    components: Record<string, ComponentSpec>;
    rules: DesignRules;
}

interface RawDesignMd {
    name?: string;
    colors?: Record<string, string>;
    typography?: Record<string, TypographyToken>;
    spacing?: Record<string, string | number>;
    rounded?: Record<string, string | number>;
    animations?: Record<string, AnimationPreset>;
    components?: Record<string, ComponentSpec>;
    rules?: DesignRules;
}

function extractFrontmatter(content: string): string | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
}

function resolveReferences(tokens: RawDesignMd): void {
    const resolve = (value: string): string => {
        return value.replace(/\{([^}]+)\}/g, (_, refPath: string) => {
            const parts = refPath.split('.');
            let current: any = tokens;
            for (const part of parts) {
                if (current == null || typeof current !== 'object') return `{${refPath}}`;
                current = current[part];
            }
            if (typeof current === 'string') return resolve(current);
            if (typeof current === 'number') return String(current);
            return `{${refPath}}`;
        });
    };

    if (tokens.components) {
        for (const [name, spec] of Object.entries(tokens.components)) {
            for (const [prop, value] of Object.entries(spec)) {
                if (typeof value === 'string' && value.includes('{')) {
                    tokens.components[name][prop] = resolve(value);
                }
            }
        }
    }
}

function normalizeStringValues(map: Record<string, string | number> | undefined): Record<string, string> {
    if (!map) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(map)) {
        result[key] = String(value);
    }
    return result;
}

export function parseDesignMd(content: string): DesignTokens | null {
    const frontmatter = extractFrontmatter(content);
    if (!frontmatter) return null;

    const raw = yaml.load(frontmatter) as RawDesignMd;
    if (!raw || typeof raw !== 'object') return null;

    resolveReferences(raw);

    return {
        name: raw.name,
        colors: raw.colors || {},
        typography: raw.typography || {},
        spacing: normalizeStringValues(raw.spacing),
        rounded: normalizeStringValues(raw.rounded),
        animations: raw.animations || {},
        components: raw.components || {},
        rules: raw.rules || {},
    };
}

export interface FoundDesignMd {
    tokens: DesignTokens;
    designMdPath: string;
}

export function findDesignMd(filePath: string, projectRoot: string): FoundDesignMd | null {
    let dir = path.dirname(path.resolve(projectRoot, filePath));
    const root = path.resolve(projectRoot);

    while (dir.startsWith(root)) {
        const candidate = path.join(dir, 'DESIGN.md');
        if (fs.existsSync(candidate)) {
            const content = fs.readFileSync(candidate, 'utf-8');
            const tokens = parseDesignMd(content);
            if (!tokens) return null;
            const designMdPath = path.relative(projectRoot, candidate);
            return { tokens, designMdPath };
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    return null;
}
