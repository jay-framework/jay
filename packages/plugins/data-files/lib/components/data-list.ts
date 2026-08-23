import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { parseDataFile, type DataRow } from '../parse-data.js';
import { loadSchema, validateRowCount } from '../load-schema.js';
import { resolveReferences } from '../resolve-references.js';
import path from 'node:path';

export interface DataListProps {
    contentDir: string;
    file: string;
}

export const dataList = makeJayStackComponent()
    .withProps<DataListProps>()
    .withSlowlyRender(async (props: DataListProps) => {
        const schema = await loadSchema(props.contentDir);
        const filePath = path.join(props.contentDir, props.file);
        const rows = await parseDataFile(filePath);

        const warning = validateRowCount(rows, filePath);
        if (warning) console.warn(warning);

        const items: Record<string, unknown>[] = [];
        for (const row of rows) {
            const resolved = await resolveReferences(row, schema.tags, props.contentDir);
            items.push(resolved);
        }

        return phaseOutput({ items }, {});
    });
