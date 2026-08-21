import path from 'node:path';
import { parseDataFile, buildSlugIndex, type DataRow } from './parse-data.js';
import { loadSchema, type SchemaTag } from './load-schema.js';

const MAX_DEPTH = 10;

const fileCache = new Map<string, Map<string, DataRow>>();

async function getSlugIndex(
    contentDir: string,
    file: string,
    slugField: string,
): Promise<Map<string, DataRow>> {
    const key = `${contentDir}/${file}`;
    if (fileCache.has(key)) return fileCache.get(key)!;

    const rows = await parseDataFile(path.join(contentDir, file));
    const index = buildSlugIndex(rows, slugField);
    fileCache.set(key, index);
    return index;
}

function findDataFile(dir: string, files: string[]): string | undefined {
    return files.find(
        (f) =>
            f.endsWith('.csv') ||
            f.endsWith('.yaml') ||
            f.endsWith('.yml') ||
            f.endsWith('.json') ||
            f.endsWith('.jsonl'),
    );
}

export async function resolveReferences(
    row: DataRow,
    tags: SchemaTag[],
    contentDir: string,
    visited: Set<string> = new Set(),
    depth: number = 0,
): Promise<Record<string, unknown>> {
    if (depth > MAX_DEPTH) {
        throw new Error(`Reference resolution exceeded maximum depth (${MAX_DEPTH})`);
    }

    const result: Record<string, unknown> = {};

    for (const tag of tags) {
        const value = row[tag.tag];

        if (tag.link && typeof value === 'string' && value !== '') {
            const linkPath = path.resolve(contentDir, path.dirname(tag.link));
            const linkedSchema = await loadSchema(linkPath);

            const fs = await import('node:fs/promises');
            const dirFiles = await fs.readdir(linkPath);
            const dataFile = findDataFile(linkPath, dirFiles);
            if (!dataFile) {
                result[tag.tag] = null;
                continue;
            }

            const visitKey = `${linkPath}/${dataFile}:${value}`;
            if (visited.has(visitKey)) {
                throw new Error(
                    `Circular reference detected: ${visitKey}\n` +
                        `Circular references are not supported in data files. Remove one of the references.`,
                );
            }
            visited.add(visitKey);

            const index = await getSlugIndex(linkPath, dataFile, linkedSchema.slugField);
            const referenced = index.get(value);
            if (referenced) {
                result[tag.tag] = await resolveReferences(
                    referenced,
                    linkedSchema.tags,
                    linkPath,
                    visited,
                    depth + 1,
                );
            } else {
                result[tag.tag] = null;
            }
        } else if (
            tag.tags &&
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
        ) {
            result[tag.tag] = await resolveReferences(
                value as DataRow,
                tag.tags,
                contentDir,
                visited,
                depth + 1,
            );
        } else if (tag.repeated && Array.isArray(value)) {
            const items: Record<string, unknown>[] = [];
            for (const item of value) {
                if (typeof item === 'object' && item !== null && tag.tags) {
                    items.push(
                        await resolveReferences(
                            item as DataRow,
                            tag.tags,
                            contentDir,
                            visited,
                            depth + 1,
                        ),
                    );
                } else {
                    items.push(item as Record<string, unknown>);
                }
            }
            result[tag.tag] = items;
        } else {
            result[tag.tag] = value;
        }
    }

    return result;
}

export function clearFileCache(): void {
    fileCache.clear();
}
