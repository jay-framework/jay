import { describe, it, expect } from 'vitest';
import { resolveElementStyles, resolveCascade } from './cascade-resolver';

describe('CSS Cascade Resolver', () => {
    describe('basic selector matching', () => {
        it('resolves a class selector', () => {
            const css = `.card { background-color: #f8fafc; padding: 16px; }`;
            const html = `<div class="card">Hello</div>`;
            const styles = resolveElementStyles([css], html, '.card');

            expect(styles?.['background-color']?.value).toEqual('#f8fafc');
            expect(styles?.['padding']?.value).toEqual('16px');
        });

        it('resolves an element selector', () => {
            const css = `button { color: white; }`;
            const html = `<button>Click</button>`;
            const styles = resolveElementStyles([css], html, 'button');

            expect(styles?.['color']?.value).toEqual('white');
        });

        it('resolves a compound selector', () => {
            const css = `button.primary { background: blue; }`;
            const html = `<button class="primary">Click</button><button class="secondary">Other</button>`;

            const primary = resolveElementStyles([css], html, 'button.primary');
            const secondary = resolveElementStyles([css], html, 'button.secondary');

            expect(primary?.['background']?.value).toEqual('blue');
            expect(secondary?.['background']).toEqual(undefined);
        });
    });

    describe('specificity resolution', () => {
        it('class beats element', () => {
            const css = `
                div { color: red; }
                .card { color: blue; }
            `;
            const html = `<div class="card">Text</div>`;
            const styles = resolveElementStyles([css], html, '.card');

            expect(styles?.['color']?.value).toEqual('blue');
            expect(styles?.['color']?.selector).toEqual('.card');
        });

        it('ID beats class', () => {
            const css = `
                .card { color: red; }
                #main { color: green; }
            `;
            const html = `<div id="main" class="card">Text</div>`;
            const styles = resolveElementStyles([css], html, '#main');

            expect(styles?.['color']?.value).toEqual('green');
            expect(styles?.['color']?.specificity).toEqual([1, 0, 0]);
        });

        it('higher compound specificity wins', () => {
            const css = `
                .card { padding: 8px; }
                div.card { padding: 16px; }
            `;
            const html = `<div class="card">Text</div>`;
            const styles = resolveElementStyles([css], html, 'div.card');

            expect(styles?.['padding']?.value).toEqual('16px');
        });

        it('equal specificity — later rule wins', () => {
            const css = `
                .first { color: red; }
                .second { color: blue; }
            `;
            const html = `<div class="first second">Text</div>`;
            const styles = resolveElementStyles([css], html, '.first');

            expect(styles?.['color']?.value).toEqual('blue');
        });
    });

    describe('!important', () => {
        it('important beats higher specificity', () => {
            const css = `
                #main { color: green; }
                .card { color: red !important; }
            `;
            const html = `<div id="main" class="card">Text</div>`;
            const styles = resolveElementStyles([css], html, '#main');

            expect(styles?.['color']?.value).toEqual('red');
            expect(styles?.['color']?.important).toEqual(true);
        });
    });

    describe('inline styles', () => {
        it('inline style beats class selector', () => {
            const css = `.card { color: blue; }`;
            const html = `<div class="card" style="color: red">Text</div>`;
            const styles = resolveElementStyles([css], html, '.card');

            expect(styles?.['color']?.value).toEqual('red');
            expect(styles?.['color']?.selector).toEqual('[inline]');
        });

        it('important in stylesheet beats inline', () => {
            const css = `.card { color: blue !important; }`;
            const html = `<div class="card" style="color: red">Text</div>`;
            const styles = resolveElementStyles([css], html, '.card');

            expect(styles?.['color']?.value).toEqual('blue');
        });
    });

    describe('multiple CSS sources (simulating linked files + style blocks)', () => {
        it('later source wins at same specificity', () => {
            const linkedCss = `.card { color: red; padding: 8px; }`;
            const inlineCss = `.card { color: blue; }`;
            const html = `<div class="card">Text</div>`;

            const styles = resolveElementStyles([linkedCss, inlineCss], html, '.card');

            expect(styles?.['color']?.value).toEqual('blue');
            expect(styles?.['padding']?.value).toEqual('8px');
        });
    });

    describe('media queries', () => {
        it('parses rules inside media queries', () => {
            const css = `
                .card { padding: 16px; }
                @media (max-width: 768px) {
                    .card { padding: 8px; }
                }
            `;
            const html = `<div class="card">Text</div>`;
            const styles = resolveElementStyles([css], html, '.card');

            // Both rules match — the media query rule comes later, wins at same specificity
            expect(styles?.['padding']?.value).toEqual('8px');
        });
    });

    describe('descendant and child selectors', () => {
        it('descendant selector matches nested elements', () => {
            const css = `.container .item { color: green; }`;
            const html = `<div class="container"><span class="item">Text</span></div>`;
            const styles = resolveElementStyles([css], html, '.item');

            expect(styles?.['color']?.value).toEqual('green');
        });

        it('child selector matches direct children only', () => {
            const css = `.container > .item { color: green; }`;
            const html = `
                <div class="container">
                    <span class="item">Direct</span>
                    <div><span class="item nested">Nested</span></div>
                </div>
            `;

            const direct = resolveElementStyles([css], html, '.container > .item');
            expect(direct?.['color']?.value).toEqual('green');
        });
    });

    describe('pseudo-classes', () => {
        it('computes specificity for pseudo-classes', () => {
            const css = `
                a { color: blue; }
                a:hover { color: red; }
            `;
            const html = `<a href="#">Link</a>`;
            const styles = resolveElementStyles([css], html, 'a');

            // :hover has higher specificity (0,1,1) vs (0,0,1) but won't match
            // in static DOM — only the base rule matches
            expect(styles?.['color']?.value).toEqual('blue');
        });
    });

    describe('attribute selectors', () => {
        it('matches attribute selectors', () => {
            const css = `[data-theme="dark"] { background: #000; }`;
            const html = `<div data-theme="dark">Dark</div>`;
            const styles = resolveElementStyles([css], html, '[data-theme="dark"]');

            expect(styles?.['background']?.value).toEqual('#000');
        });
    });

    describe('full page resolution', () => {
        it('resolves styles for all elements', () => {
            const css = `
                .header { background: #2563eb; color: white; }
                .card { background: #f8fafc; border-radius: 8px; }
                .card .title { font-size: 1.5rem; font-weight: 700; }
                button.primary { background: #2563eb; color: white; padding: 8px 16px; }
            `;
            const html = `
                <header class="header">
                    <h1>Site</h1>
                </header>
                <div class="card">
                    <h2 class="title">Card Title</h2>
                    <p>Content</p>
                    <button class="primary">Action</button>
                </div>
            `;

            const allStyles = resolveCascade([css], html);

            // Find the elements we care about
            let headerStyles: Record<string, any> | undefined;
            let titleStyles: Record<string, any> | undefined;
            let buttonStyles: Record<string, any> | undefined;

            for (const [el, styles] of allStyles) {
                if (el.classList?.contains('header')) headerStyles = styles;
                if (el.classList?.contains('title')) titleStyles = styles;
                if (el.classList?.contains('primary')) buttonStyles = styles;
            }

            expect(headerStyles?.['background']?.value).toEqual('#2563eb');
            expect(titleStyles?.['font-weight']?.value).toEqual('700');
            expect(buttonStyles?.['padding']?.value).toEqual('8px 16px');
        });
    });
});
