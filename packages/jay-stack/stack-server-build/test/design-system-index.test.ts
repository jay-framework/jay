import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ScannedPlugin } from '@jay-framework/stack-server-runtime';
import {
    buildDesignSystemIndex,
    hasTemplateForContractFile,
    listTemplatesForContractFile,
    renderAddMenu,
} from '../lib';

/** Minimal jay-html with a contract reference and optional <title>. */
function templateFile(contractRef: string, title?: string): string {
    const titleTag = title === undefined ? '' : `\n    <title>${title}</title>`;
    return `<html>
  <head>${titleTag}
    <script type="application/jay-data" contract="${contractRef}"></script>
  </head>
  <body>
    <div class="root"></div>
  </body>
</html>
`;
}

function contractFile(name: string, description?: string): string {
    return description ? `name: ${name}\ndescription: ${description}\ntags: []\n` : `name: ${name}\ntags: []\n`;
}

describe('design-system-index (DL#204)', () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'design-system-index-'));
    });

    afterEach(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    function write(relPath: string, content: string): string {
        const full = path.join(root, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
        return full;
    }

    describe('listTemplatesForContractFile — association by declared contract reference', () => {
        it('groups templates by the contract they point at, not by filename', () => {
            // One directory, two contracts, two templates — each template points at a different contract.
            const aContract = write('src/components/multi/a.jay-contract', contractFile('A'));
            const bContract = write('src/components/multi/b.jay-contract', contractFile('B'));
            write('src/components/multi/a.jay-html', templateFile('./a.jay-contract', 'A'));
            write('src/components/multi/b.jay-html', templateFile('./b.jay-contract', 'B'));

            expect(listTemplatesForContractFile(aContract)).toEqual([
                { path: path.join(root, 'src/components/multi/a.jay-html'), variant: '', title: 'A' },
            ]);
            expect(listTemplatesForContractFile(bContract)).toEqual([
                { path: path.join(root, 'src/components/multi/b.jay-html'), variant: '', title: 'B' },
            ]);
        });

        it('returns base (empty variant) first then named variants, with stem-based variant ids', () => {
            const contract = write('src/components/card/card.jay-contract', contractFile('Card'));
            write('src/components/card/card.jay-html', templateFile('./card.jay-contract', 'Card'));
            write(
                'src/components/card/card.feature.jay-html',
                templateFile('./card.jay-contract', 'Feature card'),
            );

            expect(listTemplatesForContractFile(contract)).toEqual([
                {
                    path: path.join(root, 'src/components/card/card.jay-html'),
                    variant: '',
                    title: 'Card',
                },
                {
                    path: path.join(root, 'src/components/card/card.feature.jay-html'),
                    variant: 'card.feature',
                    title: 'Feature card',
                },
            ]);
        });

        it('omits an empty or interpolation-only title', () => {
            const contract = write('src/components/hero/hero.jay-contract', contractFile('Hero'));
            write('src/components/hero/hero.jay-html', templateFile('./hero.jay-contract', '{headline}'));

            expect(listTemplatesForContractFile(contract)).toEqual([
                { path: path.join(root, 'src/components/hero/hero.jay-html'), variant: '' },
            ]);
        });

        it('hasTemplateForContractFile reflects the enumeration', () => {
            const withTemplate = write('src/components/card/card.jay-contract', contractFile('Card'));
            write('src/components/card/card.jay-html', templateFile('./card.jay-contract', 'Card'));
            const noTemplate = write('src/components/badge/badge.jay-contract', contractFile('Badge'));

            expect(hasTemplateForContractFile(withTemplate)).toBe(true);
            expect(hasTemplateForContractFile(noTemplate)).toBe(false);
            expect(hasTemplateForContractFile(undefined)).toBe(false);
        });
    });

    describe('buildDesignSystemIndex', () => {
        it('catalogs local components (multi-variant + template-less) and plugin components', () => {
            // Local: card with two variants, badge with none.
            write(
                'src/components/card/card.jay-contract',
                contractFile('Card', 'A product card with media, title and body.'),
            );
            write('src/components/card/card.jay-html', templateFile('./card.jay-contract', 'Card'));
            write(
                'src/components/card/card.feature.jay-html',
                templateFile('./card.jay-contract', 'Feature card'),
            );
            write(
                'src/components/badge/badge.jay-contract',
                contractFile('Badge', 'A small status badge.'),
            );

            // Plugin: rating with one template, resolved from a fake node_modules path.
            write(
                'node_modules/@acme/reviews/rating.jay-contract',
                contractFile('Rating', 'Star rating control.'),
            );
            write(
                'node_modules/@acme/reviews/rating.jay-html',
                templateFile('./rating.jay-contract', 'Star rating'),
            );

            const plugin = {
                name: '@acme/reviews',
                pluginPath: path.join(root, 'node_modules/@acme/reviews'),
                packageName: '@acme/reviews',
                isLocal: false,
                manifest: {
                    name: '@acme/reviews',
                    contracts: [{ name: 'rating', contract: 'rating.jay-contract' }],
                },
                dependencies: [],
            } as ScannedPlugin;

            const index = buildDesignSystemIndex({
                projectRoot: root,
                plugins: new Map([[plugin.name, plugin]]),
                resolvePluginContractPath: (p, spec) => path.join(p.pluginPath, spec),
            });

            expect(index).toEqual({
                components: [
                    {
                        name: 'Badge',
                        contractPath: './src/components/badge/badge.jay-contract',
                        description: 'A small status badge.',
                        source: 'local',
                        templates: [],
                    },
                    {
                        name: 'Card',
                        contractPath: './src/components/card/card.jay-contract',
                        description: 'A product card with media, title and body.',
                        source: 'local',
                        templates: [
                            { path: './src/components/card/card.jay-html', variant: '', title: 'Card' },
                            {
                                path: './src/components/card/card.feature.jay-html',
                                variant: 'card.feature',
                                title: 'Feature card',
                            },
                        ],
                    },
                    {
                        name: 'rating',
                        contractPath: './node_modules/@acme/reviews/rating.jay-contract',
                        description: 'Star rating control.',
                        source: 'plugin',
                        plugin: '@acme/reviews',
                        templates: [
                            {
                                path: './node_modules/@acme/reviews/rating.jay-html',
                                variant: '',
                                title: 'Star rating',
                            },
                        ],
                    },
                ],
            });
        });

        it('returns an empty catalog when there are no components', () => {
            const index = buildDesignSystemIndex({
                projectRoot: root,
                plugins: new Map(),
                resolvePluginContractPath: (p, spec) => path.join(p.pluginPath, spec),
            });
            expect(index).toEqual({ components: [] });
        });
    });

    describe('renderAddMenu', () => {
        it('renders a component with its variants and a paste-ready snippet', () => {
            const md = renderAddMenu({
                components: [
                    {
                        name: 'Card',
                        contractPath: './src/components/card/card.jay-contract',
                        description: 'A product card.',
                        source: 'local',
                        templates: [
                            { path: './src/components/card/card.jay-html', variant: '', title: 'Card' },
                            {
                                path: './src/components/card/card.feature.jay-html',
                                variant: 'card.feature',
                                title: 'Feature card',
                            },
                        ],
                    },
                ],
            });

            expect(md).toEqual(
                `# Design-system elements you can add

Generated by \`jay-stack agent-kit\`. Each component ships a contract and one or more
\`.jay-html\` templates you can flatten into a page as a \`<jay:X>\` region. Pick a variant,
paste its import + region, then run \`jay-stack sync\` to flatten the markup. See
\`designer/design-system-guide.md\`.

## Card — A product card.

| Variant | Title | Template |
| --- | --- | --- |
| (default) | Card | ./src/components/card/card.jay-html |
| card.feature | Feature card | ./src/components/card/card.feature.jay-html |

\`\`\`html
<script
  type="application/jay-headless"
  contract="./src/components/card/card.jay-contract"
  template="./src/components/card/card.jay-html"
></script>

<jay:card ref="card"><!-- flattened copy; edit freely --></jay:card>
\`\`\`

Then run \`jay-stack sync\` to flatten it.
`,
            );
        });

        it('notes a template-less component and emits a plugin snippet with plugin=', () => {
            const md = renderAddMenu({
                components: [
                    {
                        name: 'Badge',
                        contractPath: './src/components/badge/badge.jay-contract',
                        source: 'local',
                        templates: [],
                    },
                    {
                        name: 'rating',
                        contractPath: './node_modules/@acme/reviews/rating.jay-contract',
                        description: 'Star rating control.',
                        source: 'plugin',
                        plugin: '@acme/reviews',
                        templates: [
                            {
                                path: './node_modules/@acme/reviews/rating.jay-html',
                                variant: '',
                                title: 'Star rating',
                            },
                        ],
                    },
                ],
            });

            expect(md).toEqual(
                `# Design-system elements you can add

Generated by \`jay-stack agent-kit\`. Each component ships a contract and one or more
\`.jay-html\` templates you can flatten into a page as a \`<jay:X>\` region. Pick a variant,
paste its import + region, then run \`jay-stack sync\` to flatten the markup. See
\`designer/design-system-guide.md\`.

## Badge

_No template yet (COMPONENT-NO-TEMPLATE) — this component can't be flattened until it ships a \`.jay-html\`._

## rating — Star rating control.

| Variant | Title | Template |
| --- | --- | --- |
| (default) | Star rating | ./node_modules/@acme/reviews/rating.jay-html |

\`\`\`html
<script
  type="application/jay-headless"
  plugin="@acme/reviews"
  contract="rating"
  template="./node_modules/@acme/reviews/rating.jay-html"
></script>

<jay:rating ref="rating"><!-- flattened copy; edit freely --></jay:rating>
\`\`\`

Then run \`jay-stack sync\` to flatten it.
`,
            );
        });
    });
});
