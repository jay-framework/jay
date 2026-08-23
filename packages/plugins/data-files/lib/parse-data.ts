import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { FileCache } from './file-cache.js';

export type DataRow = Record<string, unknown>;

const cache = new FileCache<DataRow[]>();

export async function parseDataFile(filePath: string): Promise<DataRow[]> {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = ['.csv', '.yaml', '.yml', '.json', '.jsonl'];
    if (!supportedExtensions.includes(ext)) {
        throw new Error(
            `Unsupported data file format "${ext}". Supported: .csv, .yaml, .yml, .json, .jsonl`,
        );
    }

    return cache.get(filePath, async () => {
        const content = await fs.readFile(filePath, 'utf-8');
        switch (ext) {
            case '.csv':
                return parseCsv(content);
            case '.yaml':
            case '.yml':
                return parseYaml(content);
            case '.json':
                return parseJson(content);
            case '.jsonl':
                return parseJsonl(content);
            default:
                throw new Error('Unreachable');
        }
    });
}

function parseCsv(content: string): DataRow[] {
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim());
        const row: DataRow = {};
        for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = values[i] ?? '';
        }
        return row;
    });
}

function parseYaml(content: string): DataRow[] {
    const data = yaml.load(content);
    if (!Array.isArray(data)) {
        throw new Error('YAML data file must be an array of objects');
    }
    return data as DataRow[];
}

function parseJson(content: string): DataRow[] {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
        throw new Error('JSON data file must be an array of objects');
    }
    return data as DataRow[];
}

function parseJsonl(content: string): DataRow[] {
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as DataRow);
}

export function clearParseCache(): void {
    cache.clear();
}

export function buildSlugIndex(rows: DataRow[], slugField: string): Map<string, DataRow> {
    const index = new Map<string, DataRow>();
    for (const row of rows) {
        const slug = String(row[slugField] ?? '');
        if (slug) {
            index.set(slug, row);
        }
    }
    return index;
}
