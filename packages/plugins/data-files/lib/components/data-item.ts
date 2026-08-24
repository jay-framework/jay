import { makeJayStackComponent, notFound, phaseOutput } from '@jay-framework/fullstack-component';
import { parseDataFile, buildSlugIndex } from '../parse-data.js';
import { loadSchema, validateRowCount } from '../load-schema.js';
import { resolveReferences } from '../resolve-references.js';
import path from 'node:path';

export interface DataItemProps {
    contentDir: string;
    file: string;
    slug: string;
}

export const dataItem = makeJayStackComponent()
    .withProps<DataItemProps>()
    .withSlowlyRender(async (props: DataItemProps) => {
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
