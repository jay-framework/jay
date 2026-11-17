import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseAction } from '@jay-framework/compiler-jay-html';

const actionsDir = path.resolve(__dirname, '../actions');
const actionFiles = fs.readdirSync(actionsDir).filter((file) => file.endsWith('.jay-action'));

/**
 * Bug: the dev server logs "[ActionMetadata] Failed to parse status.jay-action / unlink.jay-action:
 * bad indentation of a mapping entry" on startup.
 * Found in: AIditor QA of the share plugin (DL #237 Implementation Results).
 * Expected: every .jay-action parses with the framework's action parser (no validations).
 * Actual: descriptions containing an unquoted ": " are invalid YAML, so the metadata is dropped.
 */
describe('share .jay-action files', () => {
    it.each(actionFiles)('%s should parse with the framework action parser', (file) => {
        const source = fs.readFileSync(path.join(actionsDir, file), 'utf-8');
        const result = parseAction(source, file);
        expect(result.validations).toEqual([]);
        expect(result.val?.description).toBeTruthy();
    });
});
