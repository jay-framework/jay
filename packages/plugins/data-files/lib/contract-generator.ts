import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadSchema, type SchemaTag } from './load-schema.js';

interface GeneratedContract {
    name: string;
    yaml: string;
}

function tagsToYaml(tags: SchemaTag[], indent: number = 0): string {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];
    for (const tag of tags) {
        lines.push(`${pad}- tag: ${tag.tag}`);
        const typeVal = Array.isArray(tag.type) ? tag.type[0] : tag.type;
        lines.push(`${pad}  type: ${typeVal}`);
        if (tag.dataType) lines.push(`${pad}  dataType: ${tag.dataType}`);
        if (tag.phase) lines.push(`${pad}  phase: ${tag.phase}`);
        if (tag.repeated) lines.push(`${pad}  repeated: true`);
        if (tag.trackBy) lines.push(`${pad}  trackBy: ${tag.trackBy}`);
        if (tag.link) lines.push(`${pad}  link: ${tag.link}`);
        if (tag.description) {
            const desc = Array.isArray(tag.description) ? tag.description[0] : tag.description;
            lines.push(`${pad}  description: ${desc}`);
        }
        if (tag.tags && tag.tags.length > 0) {
            lines.push(`${pad}  tags:`);
            lines.push(tagsToYaml(tag.tags, indent + 2));
        }
    }
    return lines.join('\n');
}

async function findContentDirs(projectRoot: string): Promise<string[]> {
    const contentDir = path.join(projectRoot, 'content');
    try {
        const entries = await fs.readdir(contentDir, { withFileTypes: true });
        const dirs: string[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const dirPath = path.join(contentDir, entry.name);
            const files = await fs.readdir(dirPath);
            const hasSchema = files.some((f) => f.endsWith('.jay-contract'));
            if (hasSchema) dirs.push(dirPath);
        }
        return dirs;
    } catch {
        return [];
    }
}

export async function* generateDataPagesContract(): AsyncGenerator<GeneratedContract> {
    const projectRoot = process.cwd();
    const dirs = await findContentDirs(projectRoot);

    for (const dir of dirs) {
        const schema = await loadSchema(dir);
        const contractYaml = [
            `name: ${schema.name}-data-pages`,
            `description: Per-item pages for ${schema.name}`,
            '',
            'props:',
            '  - name: contentDir',
            '    kind: required',
            '  - name: file',
            '    kind: required',
            '',
            'params:',
            '  - name: slug',
            '    kind: required',
            '',
            'tags:',
            tagsToYaml(schema.tags, 1),
        ].join('\n');

        yield { name: schema.name, yaml: contractYaml };
    }
}

export async function* generateDataListContract(): AsyncGenerator<GeneratedContract> {
    const projectRoot = process.cwd();
    const dirs = await findContentDirs(projectRoot);

    for (const dir of dirs) {
        const schema = await loadSchema(dir);
        const slugField = schema.slugField;
        const contractYaml = [
            `name: ${schema.name}-data-list`,
            `description: List view for ${schema.name}`,
            '',
            'props:',
            '  - name: contentDir',
            '    kind: required',
            '  - name: file',
            '    kind: required',
            '',
            'tags:',
            '  - tag: items',
            '    type: sub-contract',
            '    repeated: true',
            `    trackBy: ${slugField}`,
            '    phase: slow',
            '    tags:',
            tagsToYaml(schema.tags, 3),
        ].join('\n');

        yield { name: schema.name, yaml: contractYaml };
    }
}

export async function* generateDataItemContract(): AsyncGenerator<GeneratedContract> {
    const projectRoot = process.cwd();
    const dirs = await findContentDirs(projectRoot);

    for (const dir of dirs) {
        const schema = await loadSchema(dir);
        const contractYaml = [
            `name: ${schema.name}-data-item`,
            `description: Single item view for ${schema.name}`,
            '',
            'props:',
            '  - name: contentDir',
            '    kind: required',
            '  - name: file',
            '    kind: required',
            '  - name: slug',
            '    kind: required',
            '',
            'tags:',
            tagsToYaml(schema.tags, 1),
        ].join('\n');

        yield { name: schema.name, yaml: contractYaml };
    }
}
