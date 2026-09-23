import { materialise, mergeOverrides } from '../lib';
import type { LoadedTemplate, MaterialiseOptions } from '../lib';

/** A materialiser wired to an in-memory template map (path → template). */
function withTemplates(
    templates: Record<string, LoadedTemplate>,
    overrides: Partial<MaterialiseOptions> = {},
): MaterialiseOptions {
    return {
        resolveTemplate: (name) => (templates[name] ? name : null),
        loadTemplate: (path) => templates[path] ?? null,
        ...overrides,
    };
}

/** Collapse whitespace so structural assertions ignore serializer formatting. */
function squash(html: string): string {
    return html.replace(/\s+/g, ' ').trim();
}

describe('materialise — first-fill', () => {
    it('flattens a template body verbatim into an empty region', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: { body: `<div class="card"><h3>{heading}</h3></div>` } }),
        );
        expect(result.errors).toEqual([]);
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card"><h3>{heading}</h3></div></jay:card></body>`,
        );
    });

    it('leaves a region with no resolvable template untouched', () => {
        const page = `<body><jay:unknown ref="u"><span>as-authored</span></jay:unknown></body>`;
        const result = materialise(page, withTemplates({}));
        expect(result.errors).toEqual([]);
        expect(squash(result.html)).toBe(
            `<body><jay:unknown ref="u"><span>as-authored</span></jay:unknown></body>`,
        );
    });

    it('reports a hard error when template= cannot be loaded', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(page, {
            resolveTemplate: () => '../components/card/card.jay-html',
            loadTemplate: () => null,
        });
        expect(result.errors).toEqual([
            'cannot resolve template "../components/card/card.jay-html" for <jay:card> — check the template= provenance',
        ]);
    });
});

describe('materialise — transitive flatten', () => {
    it('flattens a nested region inside a just-filled template body', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: { body: `<div class="card"><jay:button ref="b"></jay:button></div>` },
                button: { body: `<button>{label}</button>` },
            }),
        );
        expect(result.errors).toEqual([]);
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card"><jay:button ref="b"><button>{label}</button></jay:button></div></jay:card></body>`,
        );
    });

    it('reports a cycle when a template includes itself', () => {
        const page = `<body><jay:loop ref="l"></jay:loop></body>`;
        const result = materialise(
            page,
            withTemplates({ loop: { body: `<div><jay:loop ref="inner"></jay:loop></div>` } }),
        );
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].startsWith('template inclusion cycle: <jay:loop>')).toBe(true);
    });
});

describe('materialise — @scope CSS', () => {
    it('wraps component CSS in @scope keyed on the region ref', () => {
        const page = `<body><jay:card ref="signupCard"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: { body: `<div class="card"></div>`, css: `.card { color: red }` },
            }),
        );
        expect(result.css).toBe(`@scope (.signupCard) {\n.card { color: red }\n}`);
    });

    it('emits CSS unscoped when no ref is present', () => {
        const page = `<body><jay:card></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: { body: `<div></div>`, css: `.card { color: red }` } }),
        );
        expect(result.css).toBe(`.card { color: red }`);
    });
});

describe('materialise — sync preserves override facets', () => {
    const template: LoadedTemplate = {
        body: `<div class="card"><h3 style="color: red; margin: 0">{heading}</h3><p>{body}</p></div>`,
    };

    it('re-flattens verbatim when the region has no overrides', () => {
        const page = `<body><jay:card ref="c"><div class="card"><h3 style="color: blue; margin: 0">stale</h3></div></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: template }, { preserveOverrides: true }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card"><h3 style="color: red; margin: 0">{heading}</h3><p>{body}</p></div></jay:card></body>`,
        );
    });

    it('keeps an owned attribute and re-flattens the rest', () => {
        const page = `<body><jay:card ref="c"><div class="card featured" override="class"><h3 style="color: red; margin: 0">stale</h3></div></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: template }, { preserveOverrides: true }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card featured" override="class"><h3 style="color: red; margin: 0">{heading}</h3><p>{body}</p></div></jay:card></body>`,
        );
    });

    it('keeps an owned style declaration and reconciles siblings', () => {
        const page = `<body><jay:card ref="c"><div class="card"><h3 style="color: #b00; margin: 99px" override="style.color">x</h3><p>stale</p></div></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: template }, { preserveOverrides: true }),
        );
        // color kept (page-owned), margin reconciled back to source (0), heading text reconciled.
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card"><h3 style="color: #b00; margin: 0" override="style.color">{heading}</h3><p>{body}</p></div></jay:card></body>`,
        );
    });

    it('keeps an owned subtree', () => {
        const page = `<body><jay:card ref="c"><div class="card" override="children"><h3>rewritten</h3><button>extra</button></div></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: template }, { preserveOverrides: true }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card" override="children"><h3>rewritten</h3><button>extra</button></div></jay:card></body>`,
        );
    });

    it('keeps a whole owned node', () => {
        const page = `<body><jay:card ref="c"><div class="wholly-ours" override><span>ours</span></div></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: template }, { preserveOverrides: true }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="wholly-ours" override><span>ours</span></div></jay:card></body>`,
        );
    });
});

describe('mergeOverrides — unit', () => {
    it('carries an owned attribute onto the re-flattened node', () => {
        const merged = mergeOverrides(
            `<div class="a"><h3>{t}</h3></div>`,
            `<div class="b" override="class"><h3>edited</h3></div>`,
        );
        expect(squash(merged)).toBe(`<div class="b" override="class"><h3>{t}</h3></div>`);
    });
});
