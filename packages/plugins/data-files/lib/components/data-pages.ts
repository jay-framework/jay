import { makeJayStackComponent, notFound, phaseOutput } from '@jay-framework/fullstack-component';
import { parseDataFile, buildSlugIndex, type DataRow } from '../parse-data.js';
import { loadSchema, validateRowCount } from '../load-schema.js';
import { resolveReferences } from '../resolve-references.js';
import path from 'node:path';

export interface DataPagesProps {
    contentDir: string;
    file: string;
    slug: string;
}

export const dataPages = makeJayStackComponent()
    .withProps<DataPagesProps>()
    .withLoadParams(async function* (_services: [], props?: Record<string, string>) {
        const dir = props?.contentDir;
        const file = props?.file;
        if (!dir || !file) return;

        const schema = await loadSchema(dir);
        const rows = await parseDataFile(path.join(dir, file));
        const slugField = schema.slugField;

        const slugs = rows
            .map((row) => ({ slug: String(row[slugField] ?? '') }))
            .filter((p) => p.slug !== '');
        yield slugs;
    })
    .withSlowlyRender(async (props: DataPagesProps) => {
        const schema = await loadSchema(props.contentDir);
        const filePath = path.join(props.contentDir, props.file);
        const rows = await parseDataFile(filePath);

        const warning = validateRowCount(rows, filePath);
        if (warning) console.warn(warning);

        const index = buildSlugIndex(rows, schema.slugField);
        const row = index.get(props.slug);

        if (!row) return notFound();

        const resolved = await resolveReferences(row, schema.tags, props.contentDir);
        return phaseOutput(resolved as Record<string, unknown>, {});
    });
