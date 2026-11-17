import { describe, it, expect } from 'vitest';
import { isCodeFile, isDeniedPath, PLUGIN_GITIGNORE } from '../lib/core/denylist';

describe('denylist and code files (DL221)', () => {
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
