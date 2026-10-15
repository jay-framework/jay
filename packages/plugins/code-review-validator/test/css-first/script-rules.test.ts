import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    resolveComponentScript,
    type JayHtmlValidationContext,
    type ScriptCache,
} from '@jay-framework/compiler-shared';
import { parse } from 'node-html-parser';
import { runScriptRules } from '../../lib/css-first/script-rules.js';

describe('css-first script rules', () => {
    let dir: string;

    afterEach(() => {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function contextWithScript(source: string): JayHtmlValidationContext {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crv-script-'));
        const htmlPath = path.join(dir, 'page.jay-html');
        const tsPath = path.join(dir, 'page.ts');
        fs.writeFileSync(htmlPath, '<body></body>');
        fs.writeFileSync(tsPath, source);
        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(htmlPath, dir, cache);
        return {
            body: parse('<body></body>'),
            filePath: 'page.jay-html',
            projectRoot: dir,
            headlessImports: [],
            script,
        };
    }

    it('flags bare scroll-reveal package imports', () => {
        const findings = runScriptRules(
            contextWithScript(`import AOS from 'aos';\n`),
        );
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'warning',
                ruleId: 'css-first/allow-scroll-reveal-library',
                suppressKey: 'allow-scroll-reveal-library',
                message: expect.stringContaining('aos'),
                location: expect.objectContaining({ file: 'page.ts', line: 1 }),
            }),
        ]);
    });

    it('stays silent for relative scroll-reveal paths', () => {
        const findings = runScriptRules(
            contextWithScript(`import effects from './aos';\n`),
        );
        expect(findings).toHaveLength(0);
    });

    it('stays silent when there is no component script', () => {
        const findings = runScriptRules({
            body: parse('<body></body>'),
            filePath: 'page.jay-html',
            projectRoot: '/tmp',
            headlessImports: [],
        });
        expect(findings).toHaveLength(0);
    });
});
