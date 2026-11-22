import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addIgnoredFolder, removeIgnoredFolder } from '../lib/core/gitignore-block';
import { createSandbox } from './harness';

describe('managed .gitignore block (DL#237)', () => {
    it('adds the block after existing lines and keeps them untouched', () => {
        const { site } = createSandbox();
        fs.writeFileSync(path.join(site, '.gitignore'), 'node_modules\nbuild\n');
        addIgnoredFolder(site, 'brand-ds');
        addIgnoredFolder(site, 'alpha');
        addIgnoredFolder(site, 'brand-ds');
        expect(fs.readFileSync(path.join(site, '.gitignore'), 'utf-8')).toEqual(
            'node_modules\nbuild\n\n# >>> jay share\n/.jay-share/\n/src/plugins/alpha/\n/src/plugins/brand-ds/\n# <<< jay share\n',
        );
    });

    it('removes only the folder line', () => {
        const { site } = createSandbox();
        addIgnoredFolder(site, 'brand-ds');
        fs.appendFileSync(path.join(site, '.gitignore'), '*.log\n');
        removeIgnoredFolder(site, 'brand-ds');
        expect(fs.readFileSync(path.join(site, '.gitignore'), 'utf-8')).toEqual(
            '# >>> jay share\n/.jay-share/\n# <<< jay share\n*.log\n',
        );
    });
});
