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

describe('jay-html overrides (DL#181)', () => {
    describe('parseOverrides', () => {
        it('collects a content override', () => {
            const specs = parseOverrides(
                jayTag(`<override ref="cta-label">Start free trial</override>`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: 'cta-label',
                    remove: false,
                    attributes: {},
                    content: 'Start free trial',
                    hasContent: true,
                },
            ]);
        });

        it('collects an attribute override, excluding ref and remove', () => {
            const specs = parseOverrides(
                jayTag(`<override ref="hero-image" src="/img/new.png" alt="New hero" />`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: 'hero-image',
                    remove: false,
                    attributes: { src: '/img/new.png', alt: 'New hero' },
                    content: null,
                    hasContent: false,
                },
            ]);
        });

        it('collects a remove override', () => {
            const specs = parseOverrides(jayTag(`<override ref="disclaimer" remove />`));
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: 'disclaimer',
                    remove: true,
                    attributes: {},
                    content: null,
                    hasContent: false,
                },
            ]);
        });

        it('captures a missing ref as null', () => {
            const specs = parseOverrides(jayTag(`<override>orphan</override>`));
            expect(specs).toEqual<OverrideSpec[]>([
                {
                    ref: null,
                    remove: false,
                    attributes: {},
                    content: 'orphan',
                    hasContent: true,
                },
            ]);
        });

        it('ignores non-override element children and whitespace', () => {
            const specs = parseOverrides(
                jayTag(`\n  <div>not an override</div>\n  <override ref="a">x</override>\n`),
            );
            expect(specs).toEqual<OverrideSpec[]>([
                { ref: 'a', remove: false, attributes: {}, content: 'x', hasContent: true },
            ]);
        });

        it('collects multiple overrides in document order', () => {
            const specs = parseOverrides(
                jayTag(
                    `<override ref="a">one</override><override ref="b" remove /><override ref="c" title="t" />`,
                ),
            );
            expect(specs.map((s) => s.ref)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('hasOverrides', () => {
        it('is true when the tag has an <override> child', () => {
            expect(hasOverrides(jayTag(`<override ref="a">x</override>`))).toBe(true);
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
        const body = `<div class="card">
            <button ref="cta-label" class="btn">Buy Now</button>
            <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
            <p ref="disclaimer">Terms apply</p>
            <nav ref="menu-content"><a href="/">Old</a></nav>
        </div>`;

        it('content override replaces the target children, keeping element and attributes', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="cta-label">Start free trial</override>`)),
                'card',
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Start free trial</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <p ref="disclaimer">Terms apply</p>
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
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/new.png" alt="New hero" style="border-radius: 4px; opacity: 1">
                    <p ref="disclaimer">Terms apply</p>
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
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 16px; opacity: 1; box-shadow: none">
                    <p ref="disclaimer">Terms apply</p>
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('remove override deletes the target element and its subtree', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="disclaimer" remove />`)),
                'card',
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('replaces a container ref content with nested jay component tags', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(
                        `<override ref="menu-content"><jay:MenuItem label="Home" href="/" /><jay:MenuItem label="Docs" href="/docs" /></override>`,
                    ),
                ),
                'card',
            );
            expect(result.validations).toEqual([]);
            // DL#193 Phase 3 refinement: injected `<jay:…>` component tags are stamped with the
            // `jay-from-override` provenance marker so codegen re-bases their forwarded refs to the
            // outer (override authoring) scope. The marker is stripped by codegen (never a prop).
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Buy Now</button>
                    <img ref="hero-image" src="/img/old.png" alt="Old" style="border-radius: 4px; opacity: 1">
                    <p ref="disclaimer">Terms apply</p>
                    <nav ref="menu-content"><jay:MenuItem label="Home" href="/" jay-from-override></jay:MenuItem><jay:MenuItem label="Docs" href="/docs" jay-from-override></jay:MenuItem></nav>
                </div>`),
            );
        });

        it('marks override content bindings as parent-scoped (DL#193 §C)', () => {
            const result = applyOverrides(
                `<span ref="label">{oldLabel}</span>`,
                parseOverrides(jayTag(`<override ref="label">{itemCount} items</override>`)),
                'card',
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<span ref="label">@jay:parent {itemCount} items</span>`),
            );
        });

        it('applies multiple overrides in one pass', () => {
            const result = applyOverrides(
                body,
                parseOverrides(
                    jayTag(
                        `<override ref="cta-label">Go</override><override ref="disclaimer" remove /><override ref="hero-image" alt="Alt" />`,
                    ),
                ),
                'card',
            );
            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<div class="card">
                    <button ref="cta-label" class="btn">Go</button>
                    <img ref="hero-image" src="/img/old.png" alt="Alt" style="border-radius: 4px; opacity: 1">
                    <nav ref="menu-content"><a href="/">Old</a></nav>
                </div>`),
            );
        });

        it('reports a missing ref and leaves the body unchanged', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="does-not-exist">x</override>`)),
                'card',
            );
            expect(result.validations).toEqual([
                'Cannot resolve override: no element with ref="does-not-exist" found in card. ' +
                    'Add ref="does-not-exist" to the target element in that component\'s jay-html, ' +
                    'then reference it here.',
            ]);
            expect(prettifyHtml(result.val!)).toEqual(prettifyHtml(body));
        });

        it('reports an override missing its ref attribute', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override>orphan</override>`)),
                'card',
            );
            expect(result.validations).toEqual([
                '<override> is missing a "ref" attribute in <jay:card>.',
            ]);
        });

        it('reports remove combined with content as an ambiguous operation', () => {
            const result = applyOverrides(
                body,
                parseOverrides(jayTag(`<override ref="disclaimer" remove>oops</override>`)),
                'card',
            );
            expect(result.validations).toEqual([
                '<override ref="disclaimer" remove> in <jay:card> cannot also set content or ' +
                    'attributes — remove is exclusive.',
            ]);
        });
    });
});
