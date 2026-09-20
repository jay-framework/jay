import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { prettifyHtml } from '@jay-framework/compiler-shared';
import {
    parseOverrides,
    applyOverrides,
    hasOverrides,
    remapOverrideBindingsToParent,
    type OverrideSpec,
} from '../../lib/jay-target/jay-html-overrides';

function jayTag(inner: string) {
    const root = parse(`<jay:card>${inner}</jay:card>`);
    return root.querySelector('jay\\:card')!;
}

describe('jay-html overrides (DL#181, narrowed by DL#194)', () => {
    describe('parseOverrides', () => {
        it('collects a slot content override', () => {
            const specs = parseOverrides(
                jayTag(`<override slot="body"><p>New body</p></override>`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: null,
                    slot: 'body',
                    attributes: {},
                    content: '<p>New body</p>',
                    hasContent: true,
                },
            ]);
        });

        it('collects an attribute override, excluding ref', () => {
            const specs = parseOverrides(
                jayTag(`<override ref="hero-image" src="/img/new.png" alt="New hero" />`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: 'hero-image',
                    slot: null,
                    attributes: { src: '/img/new.png', alt: 'New hero' },
                    content: null,
                    hasContent: false,
                },
            ]);
        });

        it('captures a missing slot/ref as null', () => {
            const specs = parseOverrides(jayTag(`<override>orphan</override>`));
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: null,
                    slot: null,
                    attributes: {},
                    content: 'orphan',
                    hasContent: true,
                },
            ]);
        });

        it('ignores non-override element children and whitespace', () => {
            const specs = parseOverrides(
                jayTag(`\n  <div>not an override</div>\n  <override slot="a">x</override>\n`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: null,
                    slot: 'a',
                    attributes: {},
                    content: 'x',
                    hasContent: true,
                },
            ]);
        });

        it('collects multiple overrides in document order', () => {
            const specs = parseOverrides(
                jayTag(
                    `<override slot="a">one</override><override ref="b" title="t2" /><override ref="c" title="t" />`,
                ),
            );
            expect(specs.map((s) => s.slot ?? s.ref)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('hasOverrides', () => {
        it('is true when the tag has an <override> child', () => {
            expect(hasOverrides(jayTag(`<override slot="a">x</override>`))).toBe(true);
        });

        it('is false for an empty tag', () => {
            expect(hasOverrides(jayTag(``))).toBe(false);
        });

        it('is false for a tag with only non-override content', () => {
            expect(hasOverrides(jayTag(`<div>plain</div>`))).toBe(false);
        });
    });

    describe('remapOverrideBindingsToParent (DL#193 §C parent-scope marking)', () => {
        const P = '@jay:parent ';

        it('marks a text node that carries a binding', () => {
            expect(
                prettifyHtml(remapOverrideBindingsToParent(`<span>{documentName}</span>`)),
            ).toEqual(prettifyHtml(`<span>${P}{documentName}</span>`));
        });

        it('marks a bare text binding (no wrapping element)', () => {
            expect(prettifyHtml(remapOverrideBindingsToParent(`{itemCount} items`))).toEqual(
                prettifyHtml(`${P}{itemCount} items`),
            );
        });

        it('leaves a static text node untouched', () => {
            expect(prettifyHtml(remapOverrideBindingsToParent(`<span>Terms apply</span>`))).toEqual(
                prettifyHtml(`<span>Terms apply</span>`),
            );
        });

        it('marks attribute, class and style values that carry a binding, leaving static values untouched', () => {
            expect(
                prettifyHtml(
                    remapOverrideBindingsToParent(
                        `<img src="{url}" class="{isActive ? active}" style="width: {size}px" disabled="isDisabled" alt="Static">`,
                    ),
                ),
            ).toEqual(
                prettifyHtml(
                    // src/class/style carry `{…}` bindings → marked; `disabled`/`alt` are static
                    // (no braces) → emitted verbatim (marking would leak the pragma into output).
                    `<img src="${P}{url}" class="${P}{isActive ? active}" style="${P}width: {size}px" disabled="isDisabled" alt="Static">`,
                ),
            );
        });

        it('leaves a static attribute value untouched', () => {
            // Regression (smoke-test /override): a static `href` in override content must not be
            // prefixed — the value is emitted verbatim and would otherwise leak `@jay:parent `.
            expect(prettifyHtml(remapOverrideBindingsToParent(`<a href="/docs">Docs</a>`))).toEqual(
                prettifyHtml(`<a href="/docs">Docs</a>`),
            );
        });

        it('marks brace-less expression attributes (forEach/if) even without a binding', () => {
            expect(
                prettifyHtml(
                    remapOverrideBindingsToParent(`<li forEach="items" if="isOpen">x</li>`),
                ),
            ).toEqual(prettifyHtml(`<li forEach="${P}items" if="${P}isOpen">x</li>`));
        });

        it('does not mark literal-read attributes (ref, trackBy, coordinate/scope)', () => {
            expect(
                prettifyHtml(
                    remapOverrideBindingsToParent(
                        `<li ref="row" trackBy="id" jay-coordinate-base="b" jay-scope="s" forEach="items">{name}</li>`,
                    ),
                ),
            ).toEqual(
                prettifyHtml(
                    `<li ref="row" trackBy="id" jay-coordinate-base="b" jay-scope="s" forEach="${P}items">${P}{name}</li>`,
                ),
            );
        });

        it('marks nested elements recursively', () => {
            expect(
                prettifyHtml(
                    remapOverrideBindingsToParent(
                        `<div class="{outer}"><span>{inner}</span></div>`,
                    ),
                ),
            ).toEqual(prettifyHtml(`<div class="${P}{outer}"><span>${P}{inner}</span></div>`));
        });
    });

    describe('applyOverrides', () => {
        // `body` and `menu-content` are declared slots; `cta-label` and `hero-image` are plain refs.
        const body = `<div class="card">
            <button ref="cta-label" class="btn">Buy Now</button>
            <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
            <div ref="body"><p>Default body</p></div>
            <nav ref="menu-content"><a href="/">Old</a></nav>
        </div>`;
        const slots = new Set(['body', 'menu-content']);

        it('slot content fill replaces the slot children, keeping element and attributes', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override slot="body"><p>Custom body</p></override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <div ref="body"><p>Custom body</p></div>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('empty slot fill renders the slot with nothing (replaces DL#181 remove)', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override slot="body"></override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <div ref="body"></div>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('attribute override merges only named attributes', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(`<override ref="hero-image" src="/img/new.png" alt="New hero" />`),
                ),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/new.png" alt="New hero" style="border-radius: 4px; opacity: 1">
                    <div ref="body"><p>Default body</p></div>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('style override merges per CSS property, leaving other properties intact', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(
                        `<override ref="hero-image" style="border-radius: 16px; box-shadow: none" />`,
                    ),
                ),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 16px; opacity: 1; box-shadow: none">
                    <div ref="body"><p>Default body</p></div>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('fills a slot with nested jay component tags (parent-scope marker on injected tags)', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(
                        `<override slot="menu-content"><jay:MenuItem label="Home" href="/" /><jay:MenuItem label="Docs" href="/docs" /></override>`,
                    ),
                ),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            // DL#193 Phase 3 refinement: injected `<jay:…>` component tags are stamped with the
            // `jay-from-override` provenance marker so codegen re-bases their forwarded refs to the
            // outer (override authoring) scope. The marker is stripped by codegen (never a prop).
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <div ref="body"><p>Default body</p></div>
                    <nav ref="menu-content"><jay:MenuItem label="Home" href="/" jay-from-override></jay:MenuItem><jay:MenuItem label="Docs" href="/docs" jay-from-override></jay:MenuItem></nav>
                </div>`),
            );
        });

        it('marks slot content bindings as parent-scoped (DL#193 §C)', () => {
            const result = applyOverrides(
                `<span ref="label">{oldLabel}</span>`,
                parseOverrides(jayTag(`<override slot="label">{itemCount} items</override>`)),
                'card',
                new Set(['label']),
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<span ref="label">@jay:parent {itemCount} items</span>`),
            );
        });

        it('applies multiple overrides in one pass (slot fill + attribute merges)', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(
                        `<override slot="body"><p>Go</p></override><override ref="hero-image" alt="Alt" /><override ref="cta-label" class="btn primary" />`,
                    ),
                ),
                'card',
                slots,
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn primary">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Alt" style="border-radius: 4px; opacity: 1">
                    <div ref="body"><p>Go</p></div>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('reports a missing ref for an attribute override and leaves the body unchanged', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="does-not-exist" alt="x" />`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                'Cannot resolve override: no element with ref="does-not-exist" found in card. ' +
                    'Add ref="does-not-exist" to the target element in that component\'s jay-html, ' +
                    'then reference it here.',
            ]);
            expect(prettifyHtml(result.val!)).toEqual(prettifyHtml(body));
        });

        it('reports a slot= that is not a declared slot', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override slot="ghost"><p>x</p></override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                '<override slot="ghost"> — no slot "ghost" in card. Declare it as type: slot, or ' +
                    'use <override ref="ghost" …/> to restyle an existing element.',
            ]);
        });

        it('reports content under a ref= override (attribute form takes no content)', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="cta-label">Start free trial</override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                '<override ref="cta-label"> in <jay:card> cannot have content — ' +
                    'use <override slot="cta-label">…</override> to fill a slot with content.',
            ]);
        });

        it('reports an override missing its slot/ref attribute', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override>orphan</override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                '<override> is missing a "slot" or "ref" attribute in <jay:card>.',
            ]);
        });

        it('treats a bare remove as an ordinary attribute, rejected on the slot form', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override slot="body" remove />`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                '<override slot="body"> in <jay:card> cannot also set ' +
                    'attributes — use <override ref="body" …/> for attribute merges.',
            ]);
        });

        it('reports an override addressing both slot and ref', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override slot="body" ref="body"><p>x</p></override>`)),
                'card',
                slots,
            );
            expect(result.validations).toEqual([
                '<override> in <jay:card> cannot set both "slot" and "ref" — ' +
                    'use slot="X" to fill a slot, or ref="X" to merge attributes.',
            ]);
        });
    });
});
