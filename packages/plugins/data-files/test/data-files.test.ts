import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { parseDataFile, buildSlugIndex, clearParseCache } from '../lib/parse-data';
import { loadSchema, clearSchemaCache } from '../lib/load-schema';
import { resolveReferences, clearFileCache } from '../lib/resolve-references';
import { generateSchema } from '../lib/generate-schema';

const fixturesDir = path.join(__dirname, 'fixtures');

beforeEach(() => {
    clearParseCache();
    clearSchemaCache();
    clearFileCache();
});

describe('parseDataFile', () => {
    it('parses CSV with headers', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'team/data.csv'));
        expect(rows).toHaveLength(3);
        expect(rows[0]).toEqual({
            slug: 'jane',
            name: 'Jane Doe',
            role: 'CTO',
            photo: '/team/jane.jpg',
        });
    });

    it('parses YAML array', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'faq/data.yaml'));
        expect(rows).toHaveLength(3);
        expect(rows[0].slug).toEqual('what-is-jay');
        expect(rows[0].priority).toEqual(1);
    });

    it('parses YAML with nested objects', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'recipes/data.yaml'));
        expect(rows).toHaveLength(2);
        expect(rows[0].nutrition).toEqual({ calories: 450, protein: 25 });
    });

    it('parses JSON array', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'json-data/data.json'));
        expect(rows).toHaveLength(3);
        expect(rows[0].slug).toEqual('feature-1');
        expect(rows[0].title).toEqual('Fast Builds');
        expect(rows[0].priority).toEqual(1);
    });

    it('parses JSONL (one object per line)', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'jsonl-data/data.jsonl'));
        expect(rows).toHaveLength(3);
        expect(rows[0].slug).toEqual('event-1');
        expect(rows[0].attendees).toEqual(120);
        expect(rows[2].title).toEqual('Conference');
    });

    it('throws on unsupported format', async () => {
        await expect(parseDataFile('/fake/file.txt')).rejects.toThrow(
            'Unsupported data file format',
        );
    });
});

describe('buildSlugIndex', () => {
    it('builds index keyed by slug field', async () => {
        const rows = await parseDataFile(path.join(fixturesDir, 'team/data.csv'));
        const index = buildSlugIndex(rows, 'slug');
        expect(index.size).toEqual(3);
        expect(index.get('jane')?.name).toEqual('Jane Doe');
        expect(index.get('bob')?.role).toEqual('Designer');
    });

    it('skips rows with empty slug', () => {
        const rows = [{ slug: 'a', name: 'A' }, { slug: '', name: 'B' }, { name: 'C' }];
        const index = buildSlugIndex(rows, 'slug');
        expect(index.size).toEqual(1);
    });
});

describe('loadSchema', () => {
    it('loads schema from content directory', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'team'));
        expect(schema.name).toEqual('team');
        expect(schema.slugField).toEqual('slug');
        expect(schema.tags).toHaveLength(4);
    });

    it('throws when no schema file exists', async () => {
        await expect(loadSchema(path.join(fixturesDir, 'no-schema'))).rejects.toThrow(
            'has no schema contract',
        );
    });

    it('detects slug field from meta', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'faq'));
        expect(schema.slugField).toEqual('slug');
    });

    it('loads schema with linked sub-contracts', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'recipes'));
        expect(schema.name).toEqual('recipes');
        const authorTag = schema.tags.find((t) => t.tag === 'author');
        expect(authorTag?.link).toEqual('../team/team.jay-contract');
    });
});

describe('resolveReferences', () => {
    it('passes through simple fields', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'team'));
        const row = { slug: 'jane', name: 'Jane Doe', role: 'CTO', photo: '/team/jane.jpg' };
        const resolved = await resolveReferences(row, schema.tags, path.join(fixturesDir, 'team'));
        expect(resolved).toEqual(row);
    });

    it('resolves inline nested objects', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'recipes'));
        const row = {
            slug: 'carbonara',
            title: 'Pasta Carbonara',
            author: 'jane',
            nutrition: { calories: 450, protein: 25 },
        };
        const resolved = await resolveReferences(
            row,
            schema.tags,
            path.join(fixturesDir, 'recipes'),
        );
        expect(resolved.nutrition).toEqual({ calories: 450, protein: 25 });
    });

    it('resolves linked reference by slug', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'recipes'));
        const row = {
            slug: 'carbonara',
            title: 'Pasta Carbonara',
            author: 'jane',
            nutrition: { calories: 450, protein: 25 },
        };
        const resolved = await resolveReferences(
            row,
            schema.tags,
            path.join(fixturesDir, 'recipes'),
        );
        expect(resolved.author).toEqual({
            slug: 'jane',
            name: 'Jane Doe',
            role: 'CTO',
            photo: '/team/jane.jpg',
        });
    });

    it('returns null for unresolved reference', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'recipes'));
        const row = {
            slug: 'test',
            title: 'Test',
            author: 'nonexistent',
            nutrition: { calories: 0, protein: 0 },
        };
        const resolved = await resolveReferences(
            row,
            schema.tags,
            path.join(fixturesDir, 'recipes'),
        );
        expect(resolved.author).toBeNull();
    });

    it('detects circular references', async () => {
        const schema = await loadSchema(path.join(fixturesDir, 'circular'));
        const row = { slug: 'a', name: 'Item A', related: 'b' };
        await expect(
            resolveReferences(row, schema.tags, path.join(fixturesDir, 'circular')),
        ).rejects.toThrow('Circular reference detected');
    });
});

describe('generateSchema', () => {
    it('generates schema from CSV data', async () => {
        const yaml = await generateSchema(path.join(fixturesDir, 'team'));
        expect(yaml).toMatch(/name: team/);
        expect(yaml).toMatch(/tag: slug/);
        expect(yaml).toMatch(/slug: "true"/);
        expect(yaml).toMatch(/tag: name/);
        expect(yaml).toMatch(/dataType: string/);
    });

    it('generates schema from YAML with type inference', async () => {
        const yaml = await generateSchema(path.join(fixturesDir, 'faq'));
        expect(yaml).toMatch(/name: faq/);
        expect(yaml).toMatch(/tag: priority/);
        expect(yaml).toMatch(/dataType: number/);
    });

    it('generates schema with nested objects', async () => {
        const yaml = await generateSchema(path.join(fixturesDir, 'recipes'));
        expect(yaml).toMatch(/tag: nutrition/);
        expect(yaml).toMatch(/type: sub-contract/);
        expect(yaml).toMatch(/tag: calories/);
    });

    it('generates schema from JSON data', async () => {
        const yaml = await generateSchema(path.join(fixturesDir, 'json-data'));
        expect(yaml).toMatch(/name: json-data/);
        expect(yaml).toMatch(/tag: priority/);
        expect(yaml).toMatch(/dataType: number/);
    });

    it('picks slug field from common candidates', async () => {
        const yaml = await generateSchema(path.join(fixturesDir, 'team'));
        expect(yaml).toMatch(/slug: "true"/);
    });

    it('throws on empty directory', async () => {
        await expect(generateSchema(path.join(fixturesDir, 'no-schema'))).resolves.toBeDefined();
    });
});
