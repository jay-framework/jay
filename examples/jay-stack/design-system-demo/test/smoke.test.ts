import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_STARTUP_TIMEOUT = 60000;
const CLI_TIMEOUT = 120000;
const REQUEST_TIMEOUT = 10000;
const HEALTH_POLL_INTERVAL = 500;

interface SmokeTestServer {
    url: string;
    process: ChildProcess;
    stop(): Promise<void>;
}

async function startDevServer(): Promise<SmokeTestServer> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Dev server did not start within ${SERVER_STARTUP_TIMEOUT}ms`));
        }, SERVER_STARTUP_TIMEOUT);

        let output = '';
        let detectedUrl = '';
        let pollingStarted = false;

        const proc = spawn('yarn', ['dev', '--test-mode'], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });

        const stop = async () => {
            if (detectedUrl) {
                try {
                    await fetch(`${detectedUrl}/_jay/shutdown`, { method: 'POST' });
                    await new Promise((r) => setTimeout(r, 500));
                } catch {}
            }
            proc.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 500));
        };

        proc.stdout?.on('data', (data) => {
            output += data.toString();
            const urlMatch = output.match(/Dev Server: (http:\/\/localhost:\d+)/);
            if (urlMatch) detectedUrl = urlMatch[1];
            if (
                !pollingStarted &&
                output.includes('Jay Stack dev server started successfully') &&
                detectedUrl
            ) {
                pollingStarted = true;
                pollHealth(
                    detectedUrl,
                    timeout,
                    (url) => resolve({ url, process: proc, stop }),
                    reject,
                );
            }
        });

        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to start dev server: ${err.message}`));
        });

        proc.on('exit', (code) => {
            if (!detectedUrl && code !== 0) {
                clearTimeout(timeout);
                reject(new Error(`Dev server exited with code ${code}\n${output}`));
            }
        });
    });
}

async function pollHealth(
    url: string,
    timeout: NodeJS.Timeout,
    resolve: (url: string) => void,
    reject: (err: Error) => void,
): Promise<void> {
    const startTime = Date.now();
    const poll = async () => {
        try {
            const response = await fetch(`${url}/_jay/health`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ready') {
                    clearTimeout(timeout);
                    resolve(url);
                    return;
                }
            }
        } catch {}
        if (Date.now() - startTime > SERVER_STARTUP_TIMEOUT - 1000) {
            clearTimeout(timeout);
            reject(new Error('Health endpoint never became ready'));
            return;
        }
        setTimeout(poll, HEALTH_POLL_INTERVAL);
    };
    poll();
}

async function fetchPage(
    baseUrl: string,
    pagePath: string,
): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(`${baseUrl}${pagePath}`, { signal: controller.signal });
        const body = await response.text();
        return { status: response.status, body };
    } finally {
        clearTimeout(timeout);
    }
}

function expectPage(body: string) {
    expect(body).toMatch(/<!doctype html>/i);
    expect(body).not.toMatch(/client error/i);
    expect(body).not.toMatch(/server error/i);
}

// Run `jay-stack-cli validate --json` in the project and return the parsed result + exit code.
async function runValidateCli(): Promise<{ code: number | null; result: any }> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Validate did not complete within ${CLI_TIMEOUT}ms`));
        }, CLI_TIMEOUT);
        let stdout = '';
        const proc = spawn('yarn', ['jay-stack-cli', 'validate', '--json'], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });
        proc.stdout?.on('data', (d) => (stdout += d.toString()));
        proc.stderr?.on('data', (d) => (stdout += d.toString()));
        proc.on('exit', (code) => {
            clearTimeout(timeout);
            const start = stdout.indexOf('{');
            const end = stdout.lastIndexOf('}');
            let result: any = undefined;
            if (start >= 0 && end > start) {
                try {
                    result = JSON.parse(stdout.slice(start, end + 1));
                } catch {
                    /* leave result undefined */
                }
            }
            resolve({ code, result });
        });
        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

describe('Design System Demo — dev mode', () => {
    let server: SmokeTestServer;

    beforeAll(async () => {
        server = await startDevServer();
    }, SERVER_STARTUP_TIMEOUT + 5000);

    afterAll(async () => {
        await server?.stop();
    });

    it('health check responds', async () => {
        const response = await fetch(`${server.url}/_jay/health`);
        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.status).toBe('ready');
    });

    it('/ — pristine page renders the nested design system', async () => {
        const { status, body } = await fetchPage(server.url, '/');
        expect(status).toBe(200);
        expectPage(body);
        expect(body).toMatch(/Our Plans/); // section title
        expect(body).toMatch(/Starter/); // first card instance
        expect(body).toMatch(/Pro/); // second card instance
        expect(body).toMatch(/Choose Starter/); // nested button label
    });

    it('/branded — overrides render (brand + gold modifiers)', async () => {
        const { status, body } = await fetchPage(server.url, '/branded/');
        expect(status).toBe(200);
        expectPage(body);
        expect(body).toMatch(/ds-section__title--brand/); // section h1 override (survives sync)
        expect(body).toMatch(/ds-card__heading--brand/); // deep card h3 override
        expect(body).toMatch(/ds-button--gold/); // deep button override
    });

    it('/drifted — unmarked deviations still render', async () => {
        const { status, body } = await fetchPage(server.url, '/drifted/');
        expect(status).toBe(200);
        expectPage(body);
        expect(body).toMatch(/Best Value/); // unmarked h3 text edit
        expect(body).toMatch(/ds-button--xl/); // unmarked button class edit
    });

    it('/not-linked — hand-authored (unlinked) card region renders', async () => {
        const { status, body } = await fetchPage(server.url, '/not-linked/');
        expect(status).toBe(200);
        expectPage(body);
        expect(body).toMatch(/Starter/); // card heading
        expect(body).toMatch(/Everything you need to get going/); // card body
        expect(body).toMatch(/Choose Starter/); // cta label
    });

    it('/variant — linked card with a structural ribbon renders', async () => {
        const { status, body } = await fetchPage(server.url, '/variant/');
        expect(status).toBe(200);
        expectPage(body);
        expect(body).toMatch(/Pro/); // card heading
        expect(body).toMatch(/Most popular/); // the net-new ribbon DOM
        expect(body).toMatch(/Choose Pro/); // cta label
    });
});

// DL#196 §4 — the drift validator reports unmarked deviations and honors per-facet override=
// suppression at every nesting depth. The drifted page carries two unmarked edits (both must be
// reported); the branded page marks four facets across nesting levels (none must be reported).
describe('Design System Demo — DL#196 region drift validation', () => {
    it(
        'reports exactly the two unmarked deviations on /drifted and nothing on /branded or /',
        async () => {
            const { code, result } = await runValidateCli();

            // Drift is a warning, not an error — the pages still build — so validation stays valid.
            expect(code).toBe(0);
            expect(result?.valid).toBe(true);

            const driftWarnings = (result?.warnings ?? []).filter((w: any) =>
                w.message.includes('differs from source template'),
            );

            // DL#196 §4/§5 — the pages are in canonical coalesced CSS form (same-template instances share
            // one selector-list @scope block), so no CSS-scoping warnings are raised.
            const cssScopingWarnings = (result?.warnings ?? []).filter(
                (w: any) =>
                    w.message.includes('not coalesced') ||
                    w.message.includes('mixes refs') ||
                    w.message.includes('has no @scope'),
            );
            expect(cssScopingWarnings).toEqual([]);

            // The pristine and branded pages carry no drift (branded marks every facet override=).
            const noDriftPages = ['src/pages/page.jay-html', 'src/pages/branded/page.jay-html'];
            expect(driftWarnings.filter((w: any) => noDriftPages.includes(w.file))).toEqual([]);

            // The drifted page has exactly its two unmarked deviations. (The DL#200 showcase page
            // /variant also carries one unmarked deviation; it is asserted in its own block below.)
            const driftedDrift = driftWarnings.filter(
                (w: any) => w.file === 'src/pages/drifted/page.jay-html',
            );
            expect(driftedDrift).toHaveLength(2);

            // The factual drift lives in `message`; the remediation lives in a separate `suggestion`.
            const byMessage = (m: string) => driftWarnings.find((w: any) => w.message === m);

            const cardWarning = byMessage(
                '<jay:card> region differs from source template ' +
                    '"../../components/card/card.jay-html": <h3> children changed ' +
                    '("{heading}" → "Best Value").',
            );
            expect(cardWarning).toBeDefined();
            expect(cardWarning.suggestion).toEqual(
                'To keep the page\'s version, mark the node override="children"; to discard it and ' +
                    're-flatten from source, run `jay-stack sync`.',
            );

            const buttonWarning = byMessage(
                '<jay:button> region differs from source template ' +
                    '"../../components/button/button.jay-html": <button> attribute "class" changed ' +
                    '(ds-button → ds-button ds-button--xl).',
            );
            expect(buttonWarning).toBeDefined();
            expect(buttonWarning.suggestion).toEqual(
                'To keep the page\'s version, mark the node override="class"; to discard it and ' +
                    're-flatten from source, run `jay-stack sync`.',
            );
        },
        CLI_TIMEOUT,
    );
});

// DL#200 — "prefer design-system elements". Three warnings, each on a dedicated showcase artifact:
//   • REGION-NOT-LINKED          → src/pages/not-linked (a <jay:card> whose import omits template=)
//   • REGION-OVERRIDE-NON-CONTENT → src/pages/variant   (a linked card that adds structural DOM)
//   • COMPONENT-NO-TEMPLATE       → src/components/badge (a UI component shipping no .jay-html)
// All are warnings — the build stays valid. Component source templates (section/gallery/card) hand-author
// their child regions by design, so REGION-NOT-LINKED must NOT fire on them (page-scoped rule).
describe('Design System Demo — DL#200 prefer design-system elements', () => {
    it(
        'reports each preference warning on its showcase artifact and nowhere else',
        async () => {
            const { code, result } = await runValidateCli();

            // Every DL#200 finding is a warning — the project still builds.
            expect(code).toBe(0);
            expect(result?.valid).toBe(true);
            const warns = result?.warnings ?? [];

            // REGION-NOT-LINKED — only on the not-linked page, not on any component source template.
            const notLinked = warns.filter((w: any) =>
                w.message.includes('is hand-authored, but a design-system template exists'),
            );
            expect(notLinked.map((w: any) => w.file)).toEqual([
                'src/pages/not-linked/page.jay-html',
            ]);

            // REGION-OVERRIDE-NON-CONTENT — the variant page's structural ribbon.
            const override = warns.filter((w: any) =>
                w.message.includes("changes its design-system template's look or structure"),
            );
            expect(override.some((w: any) => w.file === 'src/pages/variant/page.jay-html')).toBe(
                true,
            );

            // COMPONENT-NO-TEMPLATE — only Badge ships no template.
            const noTemplate = warns.filter((w: any) =>
                w.message.includes('ships no .jay-html template'),
            );
            expect(noTemplate.map((w: any) => w.file)).toEqual([
                'src/components/badge/badge.jay-contract',
            ]);

            // NO-DESIGN-SYSTEM must NOT fire — the project flattens real design-system elements.
            const noDesignSystem = warns.filter(
                (w: any) =>
                    w.message.includes('none are design-system elements') ||
                    w.message.includes('shares no UI through design-system elements'),
            );
            expect(noDesignSystem).toEqual([]);
        },
        CLI_TIMEOUT,
    );
});
