import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import type { AddMenuItem } from '@jay-framework/plugin-validator';

export const ADD_MENU_GENERATED_REL = 'agent-kit/aiditor/add-menu/design-system.generated.yaml';

export function readAddMenuCatalog(projectRoot: string): AddMenuItem[] {
    const catalogPath = path.join(projectRoot, ADD_MENU_GENERATED_REL);
    if (!fs.existsSync(catalogPath)) {
        return [];
    }
    const parsed = loadYaml(fs.readFileSync(catalogPath, 'utf-8')) as { items?: unknown[] };
    if (!Array.isArray(parsed.items)) {
        return [];
    }
    return parsed.items as AddMenuItem[];
}

export function writeAddMenuCatalog(projectRoot: string, items: AddMenuItem[]): string {
    const outputPath = path.join(projectRoot, ADD_MENU_GENERATED_REL);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, dumpYaml({ items }, { lineWidth: 120, noRefs: true }), 'utf-8');
    return ADD_MENU_GENERATED_REL;
}
