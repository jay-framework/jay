import { describe, it, expect } from 'vitest';
import { isCodeFile, isDeniedPath, isScriptFile, PLUGIN_GITIGNORE } from '../lib/core/denylist';

describe('denylist and code files (DL#237)', () => {
    it('denies hidden dot paths, config/, key files and id_rsa*, but keeps the root .gitignore', () => {
        const paths = [
            '.gitignore',
            '.env',
            '.env.local',
            '.vscode/settings.json',
            'src/.secret',
            'config/.wix.yaml',
            'config/app.yaml',
            'certs/server.pem',
            'a.key',
            'b.p12',
            'c.pfx',
            'id_rsa',
            'id_rsa.pub',
            'components/card/card.jay-html',
            'lib/config.ts',
        ];
        expect(paths.filter(isDeniedPath)).toEqual([
            '.env',
            '.env.local',
            '.vscode/settings.json',
            'src/.secret',
            'config/.wix.yaml',
            'config/app.yaml',
            'certs/server.pem',
            'a.key',
            'b.p12',
            'c.pfx',
            'id_rsa',
            'id_rsa.pub',
        ]);
    });

    it('starts the plugin .gitignore with .* and !.gitignore', () => {
        expect(PLUGIN_GITIGNORE.split('\n').slice(0, 2)).toEqual(['.*', '!.gitignore']);
    });

    it('classifies code files', () => {
        const files = [
            'a.ts',
            'a.tsx',
            'a.mts',
            'a.cts',
            'a.js',
            'a.jsx',
            'a.mjs',
            'a.cjs',
            'plugin.yaml',
            'agent-kit/guide.md',
            'a.css',
            'a.jay-html',
            'a.jay-contract',
        ];
        expect(files.filter(isCodeFile)).toEqual(files.slice(0, 10));
    });
});

/**
 * Bug: the Import dialog said "This plugin contains server code" for a template-only design system.
 * Found in: DL#237 Implementation Results — QA end-to-end (generated `*.d.ts` files in the plugin).
 * Expected: generated declaration files (`.d.ts`, `.d.mts`, `.d.cts`, `.jay-html.d.ts`) are neither
 * script files (`hasServerCode`) nor code files (`incoming.codeFiles`).
 * Actual: `.d.ts` matched the `.ts` extension, so `hasServerCode` was true.
 */
describe('declaration files are not code (DL#237 QA)', () => {
    const declarations = [
        'index.d.ts',
        'components/button/button.jay-html.d.ts',
        'components/button/button.jay-contract.d.ts',
        'lib/types.d.mts',
        'lib/types.d.cts',
    ];

    it('does not count declaration files as server code', () => {
        expect(declarations.filter(isScriptFile)).toEqual([]);
    });

    it('does not list declaration files as incoming code files', () => {
        expect(declarations.filter(isCodeFile)).toEqual([]);
    });

    it('still counts real scripts next to them', () => {
        expect(['index.ts', 'lib/a.d.ts.ts', 'lib/data.mts'].filter(isScriptFile)).toEqual([
            'index.ts',
            'lib/a.d.ts.ts',
            'lib/data.mts',
        ]);
    });
});
