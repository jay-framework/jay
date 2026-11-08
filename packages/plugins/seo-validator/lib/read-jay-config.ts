import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * The slice of `.jay` config the project-level SEO checks need. DL#232 decision C: the project
 * validator context carries only `projectRoot` (no parsed config), so seo-validator reads `.jay`
 * itself. Mirrors the `site`/`validations` shape of stack-cli's `JayConfig` (but owns no types there).
 */
export interface SeoProjectConfig {
    site?: { baseUrl?: string; name?: string };
    validations?: { 'allow-no-ard'?: boolean };
}

/** Read `<projectRoot>/.jay` (YAML). Missing/invalid config → an empty object. */
export function readJayConfig(projectRoot: string): SeoProjectConfig {
    const configPath = path.join(projectRoot, '.jay');
    try {
        const parsed = parseYaml(fs.readFileSync(configPath, 'utf-8')) ?? {};
        return { site: parsed.site, validations: parsed.validations };
    } catch {
        return {};
    }
}
