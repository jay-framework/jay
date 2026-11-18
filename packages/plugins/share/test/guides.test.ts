import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const shareGuide = path.resolve(__dirname, '../agent-kit/developer/share-guide.md');
const template = path.resolve(__dirname, '../../../jay-stack/stack-cli/agent-kit-template');
const headings = (file: string) =>
    fs
        .readFileSync(file, 'utf-8')
        .split('\n')
        .filter((l) => l.startsWith('#'))
        .map((l) => l.replace(/^#+\s*/, ''));

describe('share agent-kit guides (DL221)', () => {
    it('has the required sections', () => {
        const required = [
            'Choosing a sharing approach',
            'The seven flows',
            'Divergence (`SHARE_DIVERGED`)',
            'Safety rules (always)',
            'Customizing a shared design system',
            'When git sharing is not enough',
        ];
        expect(required.filter((h) => !headings(shareGuide).includes(h))).toEqual([]);
    });

    it('links plugin-structure.md by a path that resolves inside a generated project agent-kit', () => {
        const text = fs.readFileSync(shareGuide, 'utf-8');
        const link = /\]\((\.\.\/plugin\/plugin-structure\.md)\)/.exec(text)?.[1];
        // share-guide.md is copied to agent-kit/developer/; the template's plugin/ role sits beside it.
        expect(link && fs.existsSync(path.resolve(template, 'developer', link))).toEqual(true);
    });

    it('framework guides state that shareable resources live in a local plugin by default', () => {
        expect(
            headings(path.join(template, 'designer/design-system-guide.md')).filter((h) =>
                /local plugin/.test(h),
            ),
        ).toEqual(['Shareable design systems: build them in a local plugin']);
        expect(
            headings(path.join(template, 'developer/project-structure.md')).filter((h) =>
                /Local Plugin/.test(h),
            ),
        ).toEqual(['Shareable Resources Live in a Local Plugin']);
    });
});
