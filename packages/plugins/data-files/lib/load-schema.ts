import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { FileCache } from './file-cache.js';

export interface SchemaTag {
    tag: string;
    type: string | string[];
    dataType?: string;
    meta?: Record<string, string>;
    tags?: SchemaTag[];
    link?: string;
    repeated?: boolean;
    trackBy?: string;
    phase?: string;
    description?: string | string[];
}

export interface DataSchema {
    name: string;
    description?: string;
    tags: SchemaTag[];
    slugField: string;
}

const MAX_ROWS = 10_000;

const cache = new FileCache<DataSchema>();

export async function loadSchema(contentDir: string): Promise<DataSchema> {
    const files = await fs.readdir(contentDir);
    const schemaFile = files.find((f) => f.endsWith('.jay-contract'));

    if (!schemaFile) {
        throw new Error(
            `Data file in "${contentDir}" has no schema contract.\n` +
                `Create a .jay-contract file to define the data shape.\n` +
                `Run \`jay-stack run data-files/generate-schema\` to auto-generate from the data file.\n` +
                `See: agent-kit/designer/data-files-usage.md`,
        );
    }

    const filePath = path.join(contentDir, schemaFile);

    return cache.get(filePath, async () => {
        const content = await fs.readFile(filePath, 'utf-8');
        const raw = yaml.load(content) as any;

        if (!raw || !raw.name) {
            throw new Error(`Schema contract "${schemaFile}" must have a "name" field`);
        }

        const tags: SchemaTag[] = raw.tags ?? [];
        const slugField = findSlugField(tags);

        if (!slugField) {
            throw new Error(
                `Schema contract "${schemaFile}" has no slug field.\n` +
                    `Mark one tag with meta.slug: "true" to identify the item key.\n` +
                    `See: agent-kit/designer/data-files-usage.md`,
            );
        }

        return {
            name: raw.name,
            description: raw.description,
            tags,
            slugField,
        };
    });
}

export function clearSchemaCache(): void {
    cache.clear();
}

function findSlugField(tags: SchemaTag[]): string | undefined {
    for (const tag of tags) {
        if (tag.meta?.slug === 'true') {
            return tag.tag;
        }
    }
    return undefined;
}

export function validateRowCount(rows: unknown[], filePath: string): string | undefined {
    if (rows.length > MAX_ROWS) {
        return (
            `"${filePath}" has ${rows.length} rows.\n` +
            `Data files are designed for small/medium datasets (< ${MAX_ROWS} rows).\n` +
            `For large catalogs, use a CMS plugin with API-based pagination instead.\n` +
            `See: agent-kit/designer/data-files-usage.md`
        );
    }
    return undefined;
}
