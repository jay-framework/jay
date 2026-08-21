import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDataFile, type DataRow } from './parse-data.js';

function inferType(value: unknown): string {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
        if (value.startsWith('<')) return 'html-string';
        return 'string';
    }
    return 'string';
}

interface InferredTag {
    tag: string;
    type: string;
    dataType?: string;
    isSlug?: boolean;
    tags?: InferredTag[];
    repeated?: boolean;
    trackBy?: string;
}

function inferTags(rows: DataRow[]): InferredTag[] {
    if (rows.length === 0) return [];

    const firstRow = rows[0];
    const tags: InferredTag[] = [];

    for (const [key, value] of Object.entries(firstRow)) {
        if (Array.isArray(value)) {
            const itemTags =
                value.length > 0 && typeof value[0] === 'object' && value[0] !== null
                    ? inferTags(value as DataRow[])
                    : [];
            const trackBy = itemTags.find((t) => t.tag === 'id' || t.tag === 'slug')?.tag;
            tags.push({
                tag: key,
                type: 'sub-contract',
                repeated: true,
                trackBy: trackBy || (itemTags.length > 0 ? itemTags[0].tag : 'id'),
                tags: itemTags,
            });
        } else if (typeof value === 'object' && value !== null) {
            tags.push({
                tag: key,
                type: 'sub-contract',
                tags: inferTags([value as DataRow]),
            });
        } else {
            tags.push({
                tag: key,
                type: 'data',
                dataType: inferType(value),
            });
        }
    }

    return tags;
}

function pickSlugField(tags: InferredTag[]): string | undefined {
    const candidates = ['slug', 'id', 'key', 'name'];
    for (const candidate of candidates) {
        if (tags.find((t) => t.tag === candidate && t.type === 'data')) {
            return candidate;
        }
    }
    return tags.find((t) => t.type === 'data')?.tag;
}

function tagToYaml(tag: InferredTag, indent: number): string {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];
    lines.push(`${pad}- tag: ${tag.tag}`);
    lines.push(`${pad}  type: ${tag.type}`);
    if (tag.dataType) lines.push(`${pad}  dataType: ${tag.dataType}`);
    if (tag.isSlug) {
        lines.push(`${pad}  meta:`);
        lines.push(`${pad}    slug: "true"`);
    }
    if (tag.repeated) lines.push(`${pad}  repeated: true`);
    if (tag.trackBy) lines.push(`${pad}  trackBy: ${tag.trackBy}`);
    if (tag.tags && tag.tags.length > 0) {
        lines.push(`${pad}  tags:`);
        for (const child of tag.tags) {
            lines.push(tagToYaml(child, indent + 2));
        }
    }
    return lines.join('\n');
}

export async function generateSchema(contentDir: string): Promise<string> {
    const files = await fs.readdir(contentDir);
    const dataFile = files.find(
        (f) =>
            f.endsWith('.csv') ||
            f.endsWith('.yaml') ||
            f.endsWith('.yml') ||
            f.endsWith('.json') ||
            f.endsWith('.jsonl'),
    );

    if (!dataFile) {
        throw new Error(`No data file found in "${contentDir}"`);
    }

    const rows = await parseDataFile(path.join(contentDir, dataFile));
    if (rows.length === 0) {
        throw new Error(`Data file "${dataFile}" is empty`);
    }

    const tags = inferTags(rows);
    const slugField = pickSlugField(tags);

    if (slugField) {
        const slugTag = tags.find((t) => t.tag === slugField);
        if (slugTag) slugTag.isSlug = true;
    }

    const dirName = path.basename(contentDir);
    const lines = [
        `name: ${dirName}`,
        `description: Auto-generated schema for ${dirName}`,
        '',
        'tags:',
        ...tags.map((t) => tagToYaml(t, 1)),
    ];

    return lines.join('\n') + '\n';
}

export async function generateSchemaCommand(args: string[]): Promise<void> {
    const contentDir = args[0];
    if (!contentDir) {
        console.error(
            'Usage: jay-stack run data-files/generate-schema <content-dir>\n' +
                'Example: jay-stack run data-files/generate-schema content/team',
        );
        process.exit(1);
    }

    const yaml = await generateSchema(contentDir);
    const dirName = path.basename(contentDir);
    const outputPath = path.join(contentDir, `${dirName}.jay-contract`);

    try {
        await fs.access(outputPath);
        console.error(`Schema file already exists: ${outputPath}\nDelete it first to regenerate.`);
        process.exit(1);
    } catch {
        // File doesn't exist — proceed
    }

    await fs.writeFile(outputPath, yaml, 'utf-8');
    console.log(`Generated schema: ${outputPath}`);
    console.log('Review and refine the schema — check slug field, add descriptions, define links.');
}
