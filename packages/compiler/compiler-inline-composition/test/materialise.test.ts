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
    it('flattens a single-root region body verbatim and emits root CSS scoped to the ref', () => {
        // DL#206 Phase 3 — the materialiser no longer writes the `display:contents` anchor; the compiler
        // synthesizes it at build time (`assignHeadlessInstance`). The source stays wrapper-free, and the
        // root CSS is still emitted inside `@scope (.<ref>)` — no `:scope` rewrite: the real root `.card`
        // matches as an ordinary descendant of the (build-time) `.signupCard` anchor.
        const page = `<body><jay:card ref="signupCard"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: { body: `<div class="card"></div>`, css: `.card { color: red }` },
            }),
        );
        expect(result.css).toBe(`@scope (.signupCard) {\n.card { color: red }\n}`);
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="signupCard"><div class="card"></div></jay:card></body>`,
        );
    });

    it('emits CSS unscoped when no ref is present', () => {
        const page = `<body><jay:card></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: { body: `<div></div>`, css: `.card { color: red }` } }),
        );
        expect(result.css).toBe(`.card { color: red }`);
        // No ref → no scope → no wrapper; the body is flattened as authored.
        expect(squash(result.html)).toBe(`<body><jay:card><div></div></jay:card></body>`);
    });

    it('emits @scope keyed on the ref while the flattened body stays verbatim (anchor is build-time)', () => {
        const page = `<body><jay:card ref="promo"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><h3 class="card-heading">x</h3></div>`,
                    css: `.card-heading { color: red }`,
                },
            }),
        );
        expect(result.css).toBe(`@scope (.promo) {\n.card-heading { color: red }\n}`);
        // The source stays the author's body — the `.promo` scope anchor is synthesized at compile time.
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="promo"><div class="card"><h3 class="card-heading">x</h3></div></jay:card></body>`,
        );
    });

    it('does not wrap when the template ships no CSS (and the ref is not a donut boundary)', () => {
        const page = `<body><jay:card ref="promo"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: { body: `<div class="card"></div>` } }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="promo"><div class="card"></div></jay:card></body>`,
        );
    });

    it('styles two distinct roots of a multi-root region, each verbatim under one @scope', () => {
        // DL#206 — the core fix: a two-root region is wrapped (at compile time) in a single `.hero` anchor, so
        // `.ds-media` and `.ds-ribbon` survive as distinct descendant rules instead of both collapsing to
        // `:scope`. The materialiser's job is just the `@scope (.hero)` block; the body stays verbatim.
        const page = `<body><jay:card ref="hero"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="ds-media"></div><aside class="ds-ribbon"></aside>`,
                    css: `.ds-media { aspect-ratio: 16/9 } .ds-ribbon { position: absolute }`,
                },
            }),
        );
        expect(result.css).toBe(
            `@scope (.hero) {\n.ds-media { aspect-ratio: 16/9 } .ds-ribbon { position: absolute }\n}`,
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="hero">` +
                `<div class="ds-media"></div><aside class="ds-ribbon"></aside>` +
                `</jay:card></body>`,
        );
    });

    it('coalesces same-template instances into one selector-list @scope block', () => {
        // DL#196 §4/§5: N override-free instances of a template emit one @scope (.a, .b), not N copies.
        const page = `<body><jay:card ref="cardStarter"></jay:card><jay:card ref="cardPro"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: { body: `<div class="card"></div>`, css: `.card { color: red }` },
            }),
        );
        expect(result.css).toBe(`@scope (.cardStarter, .cardPro) {\n.card { color: red }\n}`);
    });

    it('does not coalesce instances flattened from different templates', () => {
        // Same body bytes, different provenance → independent sources, kept as separate blocks.
        const page = `<body><jay:cardA ref="a"></jay:cardA><jay:cardB ref="b"></jay:cardB></body>`;
        const result = materialise(page, {
            resolveTemplate: (name) => (name === 'carda' ? 'a.jay-html' : 'b.jay-html'),
            loadTemplate: (path) => ({
                body: `<div class="card"></div>`,
                css: `.card { color: red }`,
            }),
        });
        expect(result.css).toBe(
            `@scope (.a) {\n.card { color: red }\n}\n\n@scope (.b) {\n.card { color: red }\n}`,
        );
    });

    it('emits compound and descendant selectors verbatim (no :scope rewrite)', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><span class="card__tag">x</span></div>`,
                    css: `.card { color: red } .card.active { color: blue } .card .card__tag { color: green }`,
                },
            }),
        );
        expect(result.css).toBe(
            `@scope (.c) {\n.card { color: red } .card.active { color: blue } ` +
                `.card .card__tag { color: green }\n}`,
        );
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

    it('preserves a nested override on re-sync of a wrapper-free body (DL#206 Phase 3)', () => {
        // Post-Phase-3 the flattened region body is wrapper-free (the `display:contents` anchor is
        // synthesized by the compiler at build time, never written to source). So sync aligns the page body
        // against the template body directly — no wrapper to see through — and the `override` one level deep
        // survives the re-flatten.
        const cssTemplate: LoadedTemplate = {
            body: `<div class="card"><h3 class="card-heading">{heading}</h3><p>{body}</p></div>`,
            css: `.card-heading { color: black }`,
        };
        const page =
            `<body><jay:card ref="c">` +
            `<div class="card"><h3 class="card-heading featured" override="class">{heading}</h3><p>{body}</p></div>` +
            `</jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({ card: cssTemplate }, { preserveOverrides: true }),
        );
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c">` +
                `<div class="card"><h3 class="card-heading featured" override="class">{heading}</h3><p>{body}</p></div>` +
                `</jay:card></body>`,
        );
    });
});

describe('materialise — sync preserves overrides inside nested regions (Issue 1)', () => {
    const templates = {
        card: { body: `<div class="card"><jay:button ref="b"></jay:button></div>` },
        button: { body: `<button class="btn">{label}</button>` },
    };

    it('preserves an override facet inside a nested region without marking the parent inclusion', () => {
        const page =
            `<body><jay:card ref="c"><div class="card">` +
            `<jay:button ref="b"><button class="btn btn--gold" override="class">{label}</button></jay:button>` +
            `</div></jay:card></body>`;
        const result = materialise(page, withTemplates(templates, { preserveOverrides: true }));

        expect(result.errors).toEqual([]);
        // The deep <button override="class"> survives even though neither <jay:card> nor <jay:button> is marked.
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card">` +
                `<jay:button ref="b"><button class="btn btn--gold" override="class">{label}</button></jay:button>` +
                `</div></jay:card></body>`,
        );
    });

    it('re-flattens an unmarked deviation inside a nested region (consistent with validate)', () => {
        const page =
            `<body><jay:card ref="c"><div class="card">` +
            `<jay:button ref="b"><button class="btn btn--xl">{label}</button></jay:button>` +
            `</div></jay:card></body>`;
        const result = materialise(page, withTemplates(templates, { preserveOverrides: true }));

        expect(result.errors).toEqual([]);
        // Unmarked → the nested button's class is reconciled back to source (validate would report it as drift).
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card">` +
                `<jay:button ref="b"><button class="btn">{label}</button></jay:button>` +
                `</div></jay:card></body>`,
        );
    });

    it('preserves overrides two region levels deep (section → card → button)', () => {
        const deep = {
            section: { body: `<section><jay:card ref="c"></jay:card></section>` },
            card: {
                body: `<div class="card"><h3 class="ttl">{heading}</h3><jay:button ref="b"></jay:button></div>`,
            },
            button: { body: `<button class="btn">{label}</button>` },
        };
        const page =
            `<body><jay:section ref="s"><section><jay:card ref="c"><div class="card">` +
            `<h3 class="ttl ttl--brand" override="class">{heading}</h3>` +
            `<jay:button ref="b"><button class="btn btn--gold" override="class">{label}</button></jay:button>` +
            `</div></jay:card></section></jay:section></body>`;
        const result = materialise(page, withTemplates(deep, { preserveOverrides: true }));

        expect(result.errors).toEqual([]);
        // Both the card-level <h3 override> and the button-level <button override> survive the re-flatten.
        expect(squash(result.html)).toBe(
            `<body><jay:section ref="s"><section><jay:card ref="c"><div class="card">` +
                `<h3 class="ttl ttl--brand" override="class">{heading}</h3>` +
                `<jay:button ref="b"><button class="btn btn--gold" override="class">{label}</button></jay:button>` +
                `</div></jay:card></section></jay:section></body>`,
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

describe('mergeOverrides — content slot (jay-content, DL#202)', () => {
    it('preserves the consumer content under a content-slot template node (no page marker needed)', () => {
        const merged = mergeOverrides(
            `<div class="card"><p jay-content>{body}</p></div>`,
            `<div class="card"><p>Everything you need <strong>today</strong>.</p></div>`,
        );
        // The template's `{body}` is not re-imposed; the page's edited children survive. The `jay-content`
        // marker is template-side only, so it is stripped from the flattened page (DL#202 refinement).
        expect(squash(merged)).toBe(
            `<div class="card"><p>Everything you need <strong>today</strong>.</p></div>`,
        );
    });

    it('without the marker, the template content wins on re-flatten (override-model fallback)', () => {
        const merged = mergeOverrides(
            `<div class="card"><p>{body}</p></div>`,
            `<div class="card"><p>edited body</p></div>`,
        );
        expect(squash(merged)).toBe(`<div class="card"><p>{body}</p></div>`);
    });

    it('a content slot governs children only — the node own attributes still re-flatten from source', () => {
        const merged = mergeOverrides(
            `<div class="card"><p class="body" jay-content>{body}</p></div>`,
            `<div class="card"><p class="body edited">consumer copy</p></div>`,
        );
        // class is unmarked ⇒ re-flattened to source ("body"); children preserved ("consumer copy").
        // The template-side `jay-content` marker is stripped from the flattened page.
        expect(squash(merged)).toBe(`<div class="card"><p class="body">consumer copy</p></div>`);
    });

    it('preserves consumer values for attributes named by a content slot (jay-content="src alt")', () => {
        const merged = mergeOverrides(
            `<div class="hero"><img jay-content="src alt" src="placeholder.png" alt="placeholder"></div>`,
            `<div class="hero"><img src="hero.png" alt="Our hero"></div>`,
        );
        // src/alt are the consumer's content and survive the re-flatten; no page-side marker is needed, and the
        // template-side `jay-content` marker is stripped from the flattened page.
        expect(squash(merged)).toBe(`<div class="hero"><img src="hero.png" alt="Our hero"></div>`);
    });

    it('a content slot that lists only attributes still re-flattens the children from source', () => {
        const merged = mergeOverrides(
            `<figure jay-content="src"><img src="p.png"><figcaption>{caption}</figcaption></figure>`,
            `<figure><img src="hero.png"><figcaption>edited caption</figcaption></figure>`,
        );
        // src (the figure's own attr) is the slot; children (img, figcaption) re-flatten. The template-side
        // `jay-content` marker is stripped from the flattened page.
        expect(squash(merged)).toBe(
            `<figure><img src="p.png"><figcaption>{caption}</figcaption></figure>`,
        );
    });
});

describe('materialise — @scope donut (to), DL#203', () => {
    it('stops a scoped region at a nested ref-bearing child region (emits `to`)', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><jay:button ref="b"></jay:button></div>`,
                    css: `.card { color: red }`,
                },
                button: { body: `<button>{label}</button>` },
            }),
        );
        expect(result.css).toBe(`@scope (.c) to (.b) {\n.card { color: red }\n}`);
        // DL#206 Phase 3 — the source stays wrapper-free; the donut boundary `.b` resolves to the child
        // region's build-time anchor. `to (.b)` is computed from the child `<jay:button ref="b">`, not from
        // any wrapper in the flattened body.
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card">` +
                `<jay:button ref="b"><button>{label}</button></jay:button>` +
                `</div></jay:card></body>`,
        );
    });

    it('a leaf scoped region (no child regions) emits a plain @scope block', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: { body: `<div class="card"><h3>x</h3></div>`, css: `.card { color: red }` },
            }),
        );
        expect(result.css).toBe(`@scope (.c) {\n.card { color: red }\n}`);
    });

    it('omits a ref-less child region from the donut (and does not wrap it)', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><jay:button></jay:button></div>`,
                    css: `.card { color: red }`,
                },
                button: { body: `<button>{label}</button>` },
            }),
        );
        expect(result.css).toBe(`@scope (.c) {\n.card { color: red }\n}`);
        expect(squash(result.html)).toBe(
            `<body><jay:card ref="c"><div class="card">` +
                `<jay:button><button>{label}</button></jay:button>` +
                `</div></jay:card></body>`,
        );
    });

    it('omits a non-materialisable child region from the donut', () => {
        const page = `<body><jay:card ref="c"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><jay:widget ref="w"></jay:widget></div>`,
                    css: `.card { color: red }`,
                },
                // no `widget` template → not materialisable → no anchor → omitted from `to`
            }),
        );
        expect(result.css).toBe(`@scope (.c) {\n.card { color: red }\n}`);
    });

    it('coalesces same-template instances with matching child nesting into one donut block', () => {
        const page = `<body><jay:card ref="cardA"></jay:card><jay:card ref="cardB"></jay:card></body>`;
        const result = materialise(
            page,
            withTemplates({
                card: {
                    body: `<div class="card"><jay:button ref="b"></jay:button></div>`,
                    css: `.card { color: red }`,
                },
                button: { body: `<button>{label}</button>` },
            }),
        );
        expect(result.css).toBe(`@scope (.cardA, .cardB) to (.b) {\n.card { color: red }\n}`);
    });

    it('nested multi-root region: parent donut excludes the child subtree and each level styles its own roots', () => {
        // DL#206 §4 — a multi-root parent region nests a multi-root child region. The parent's donut
        // `to (.card)` resolves to the child's build-time anchor, excluding the child subtree, and each
        // level's roots are styled distinctly inside its own @scope block. The source stays wrapper-free.
        const page = `<body><jay:section ref="hero"></jay:section></body>`;
        const result = materialise(
            page,
            withTemplates({
                section: {
                    body: `<header class="sec-head"></header><div class="sec-body"><jay:card ref="card"></jay:card></div>`,
                    css: `.sec-head { color: red } .sec-body { color: blue }`,
                },
                card: {
                    body: `<div class="ds-media"></div><aside class="ds-ribbon"></aside>`,
                    css: `.ds-media { aspect-ratio: 16/9 } .ds-ribbon { position: absolute }`,
                },
            }),
        );
        expect(result.css).toBe(
            `@scope (.hero) to (.card) {\n.sec-head { color: red } .sec-body { color: blue }\n}` +
                `\n\n` +
                `@scope (.card) {\n.ds-media { aspect-ratio: 16/9 } .ds-ribbon { position: absolute }\n}`,
        );
        expect(squash(result.html)).toBe(
            `<body><jay:section ref="hero">` +
                `<header class="sec-head"></header>` +
                `<div class="sec-body"><jay:card ref="card">` +
                `<div class="ds-media"></div><aside class="ds-ribbon"></aside>` +
                `</jay:card></div>` +
                `</jay:section></body>`,
        );
    });
});
