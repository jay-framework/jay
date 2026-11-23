/**
 * DL#237 — html-safety validate rules.
 *
 * - `HTML-STRING-TRUST` (warning): a jay-html text binding resolves to an `html-string` contract tag.
 * - `RAW-HTML-SINK` (warning): a raw HTML DOM sink in the component `.ts` beside the jay-html.
 * - `INLINE-EVENT-HANDLER` (error): an `on*` attribute on an HTML/SVG element.
 * - `JAVASCRIPT-URL` (error): a static URL attribute with a `javascript:`, `vbscript:` or `data:text/html` URL.
 *
 * Every message starts with its rule id and names the agent-kit guide.
 */
import path from 'path';
import fs from 'fs';
import type { HTMLElement } from 'node-html-parser';
import type { Contract, ContractTag, JayHtmlSourceFile } from '@jay-framework/compiler-jay-html';
import { isHtmlStringType } from '@jay-framework/compiler-shared';
import { resolveContractLinks } from './validate';

/** Runs all four rules for one jay-html file: warnings and errors by severity. */
export function checkHtmlSafety(
    jayHtml: JayHtmlSourceFile,
    jayHtmlPath: string,
): { warnings: string[]; errors: string[] } {
    return {
        warnings: [
            ...checkHtmlStringTrust(jayHtml, path.dirname(jayHtmlPath)),
            ...checkRawHtmlSinks(jayHtmlPath),
        ],
        errors: [...checkInlineEventHandlers(jayHtml), ...checkJavascriptUrls(jayHtml)],
    };
}

const GUIDE = 'See agent-kit/developer/html-safety.md.';
const VALIDATIONS_SCRIPT = '<script type="application/jay-validations">';

export function checkHtmlStringTrust(jayHtml: JayHtmlSourceFile, pageDir?: string): string[] {
    const allowed = allowList(jayHtml, 'allow-html-string');
    return findHtmlStringBindings(jayHtml, pageDir)
        .filter((binding) => !binding.suppressedOnImport)
        .filter((binding) => !allowed.has(binding.qualifiedPath) && !allowed.has(binding.tagPath))
        .map(
            ({ qualifiedPath, element }) =>
                `HTML-STRING-TRUST: {${qualifiedPath}} on <${element}> is html-string and is rendered as raw HTML. ` +
                `Jay does not sanitize html-string anywhere (server, slow phase, client). ` +
                `Bind only trusted markup, or sanitize it at the source on the server, then add it to ` +
                `jay-stack: { allow-html-string: ["${qualifiedPath}"] } in this page's application/jay-validations script, ` +
                `or add jay-validations="HTML-STRING-TRUST" on the headless import. ${GUIDE}`,
        );
}

export function checkInlineEventHandlers(jayHtml: JayHtmlSourceFile): string[] {
    const allowed = allowList(jayHtml, 'allow-inline-handler');
    const errors: string[] = [];
    for (const element of domElements(jayHtml.body)) {
        const elementName = element.rawTagName.toLowerCase();
        for (const attr of Object.keys(element.attributes).map((a) => a.toLowerCase())) {
            if (!/^on[a-z]+$/.test(attr) || allowed.has(`${elementName}@${attr}`)) continue;
            errors.push(
                `INLINE-EVENT-HANDLER: Inline event handler ${attr} on <${elementName}>. ` +
                    `Add a ref and handle the event in the component. ` +
                    `Suppress with jay-stack: { allow-inline-handler: ["${elementName}@${attr}"] } in ` +
                    `${VALIDATIONS_SCRIPT}. ${GUIDE}`,
            );
        }
    }
    return errors;
}

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const SCRIPT_URL_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html'];

export function checkJavascriptUrls(jayHtml: JayHtmlSourceFile): string[] {
    const allowed = allowList(jayHtml, 'allow-javascript-url');
    const errors: string[] = [];
    for (const element of domElements(jayHtml.body)) {
        const elementName = element.rawTagName.toLowerCase();
        for (const [name, rawValue] of Object.entries(element.attributes)) {
            const attr = name.toLowerCase();
            const value = rawValue.trim();
            if (!URL_ATTRIBUTES.has(attr) || value.includes('{') || allowed.has(value)) continue;
            const scheme = scriptUrlScheme(value);
            if (!scheme) continue;
            errors.push(
                `JAVASCRIPT-URL: ${attr} on <${elementName}> uses a ${scheme} URL, which runs script. ` +
                    `Use a ref + event handler. ` +
                    `Suppress with jay-stack: { allow-javascript-url: ["${value}"] } in ` +
                    `${VALIDATIONS_SCRIPT}. ${GUIDE}`,
            );
        }
    }
    return errors;
}

/** Browsers ignore tabs/newlines inside a URL scheme, and schemes are case-insensitive. */
function scriptUrlScheme(value: string): string | undefined {
    const normalized = value.replace(/[\t\n\r]/g, '').toLowerCase();
    return SCRIPT_URL_SCHEMES.find((scheme) => normalized.startsWith(scheme));
}

const RAW_HTML_SINKS: Array<{ sink: string; pattern: RegExp }> = [
    { sink: 'innerHTML =', pattern: /\.innerHTML\s*=(?!=)/ },
    { sink: 'outerHTML =', pattern: /\.outerHTML\s*=(?!=)/ },
    { sink: 'insertAdjacentHTML(', pattern: /\.insertAdjacentHTML\s*\(/ },
    { sink: 'document.write(', pattern: /\bdocument\.write(ln)?\s*\(/ },
];

/** `// jay-validations: RAW-HTML-SINK <reason>` — the reason is required. */
const SINK_SUPPRESSION = /\/\/\s*jay-validations:\s*RAW-HTML-SINK\s+\S/;

/**
 * Plain line scan of the component `.ts` beside the jay-html (same lookup as the direct-DOM check). It does
 * not skip comments or strings, so false positives are suppressed with the comment.
 */
export function checkRawHtmlSinks(jayHtmlPath: string): string[] {
    const componentPath = findComponentFile(jayHtmlPath);
    if (!componentPath) return [];
    const fileName = path.basename(componentPath);
    const lines = fs.readFileSync(componentPath, 'utf-8').split('\n');
    const warnings: string[] = [];
    lines.forEach((line, index) => {
        const found = RAW_HTML_SINKS.find(({ pattern }) => pattern.test(line));
        if (!found || isSinkSuppressed(line, lines[index - 1])) return;
        warnings.push(
            `RAW-HTML-SINK: Raw HTML sink "${found.sink}" at ${fileName}:${index + 1}. ` +
                `Use a text binding, or an html-string tag with data sanitized at the source. ` +
                `Suppress with // jay-validations: RAW-HTML-SINK <reason> on the same or preceding line. ${GUIDE}`,
        );
    });
    return warnings;
}

function isSinkSuppressed(line: string, previousLine: string | undefined): boolean {
    return SINK_SUPPRESSION.test(line) || SINK_SUPPRESSION.test(previousLine ?? '');
}

function findComponentFile(jayHtmlPath: string): string | undefined {
    const dirname = path.dirname(jayHtmlPath);
    const basename = path.basename(jayHtmlPath, '.jay-html');
    return [path.join(dirname, `${basename}.ts`), path.join(dirname, 'page.ts')].find((p) =>
        fs.existsSync(p),
    );
}

// --- shared helpers ---

function allowList(jayHtml: JayHtmlSourceFile, key: string): Set<string> {
    const value = jayHtml.validationOverrides?.['jay-stack']?.[key];
    return new Set(Array.isArray(value) ? value.map(String) : []);
}

/** Every HTML/SVG element in the body; `<jay:…>` instances carry props, not DOM attributes. */
function domElements(root: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = [];
    const visit = (element: HTMLElement) => {
        if (element.rawTagName && !element.rawTagName.toLowerCase().startsWith('jay:')) {
            result.push(element);
        }
        for (const child of element.childNodes) {
            if (child.nodeType === 1) visit(child as HTMLElement);
        }
    };
    visit(root);
    return result;
}

// --- html-string binding resolution ---

interface HtmlStringBinding {
    /** Path as written in the allow list: `<key>.<tag path>`, or the tag path for un-keyed sources. */
    qualifiedPath: string;
    /** Contract tag path without the key. */
    tagPath: string;
    element: string;
    suppressedOnImport: boolean;
}

interface BindingSource {
    key?: string;
    tags: ContractTag[];
    suppressedOnImport: boolean;
}

interface BindingScope {
    source: BindingSource;
    prefix: string;
}

const TEXT_BINDING = /\{([^}]+)\}/g;
const SIMPLE_PATH = /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/;

/**
 * Walks the body with the same scoping as tag coverage (keyed `key.path`, `forEach`, `<jay:x>` instances,
 * `<with-data accessor>`), resolving each text binding against contracts whose `link:` sub-contracts are
 * resolved, so linked tags are addressed through the linking tag (e.g. `article.author.bio`).
 */
function findHtmlStringBindings(jayHtml: JayHtmlSourceFile, pageDir?: string): HtmlStringBinding[] {
    const keyed = new Map<string, BindingSource>();
    const byContractName = new Map<string, BindingSource>();
    for (const imp of jayHtml.headlessImports) {
        if (!imp.contract) continue;
        const source: BindingSource = {
            key: imp.key,
            tags: resolveContractLinks(imp.contract, imp.contractPath).tags,
            suppressedOnImport: imp.suppressedValidations?.includes('HTML-STRING-TRUST') ?? false,
        };
        if (imp.key) keyed.set(imp.key, source);
        byContractName.set(imp.contractName, source);
    }
    const pageContractPath =
        pageDir && jayHtml.contractRef ? path.resolve(pageDir, jayHtml.contractRef) : undefined;
    const pageScopes: BindingScope[] = jayHtml.contract
        ? [{ source: pageSource(jayHtml.contract, pageContractPath), prefix: '' }]
        : [];

    const bindings: HtmlStringBinding[] = [];

    function resolveScopedPath(
        expression: string,
        scopes: BindingScope[],
    ): BindingScope | undefined {
        const [first, ...rest] = expression.split('.');
        const keyedSource = keyed.get(first);
        if (keyedSource && rest.length > 0) return { source: keyedSource, prefix: rest.join('.') };
        const scope = scopes[scopes.length - 1];
        if (!scope) return undefined;
        return {
            source: scope.source,
            prefix: scope.prefix ? `${scope.prefix}.${expression}` : expression,
        };
    }

    function walk(element: HTMLElement, scopes: BindingScope[]): void {
        const tagName = element.rawTagName?.toLowerCase();
        let childScopes = scopes;
        if (tagName?.startsWith('jay:')) {
            const source = byContractName.get(tagName.substring(4));
            if (source) childScopes = [...childScopes, { source, prefix: '' }];
        }
        const forEach = element.getAttribute?.('forEach');
        if (forEach && SIMPLE_PATH.test(forEach.trim())) {
            const scope = resolveScopedPath(forEach.trim(), childScopes);
            if (scope) childScopes = [...childScopes, scope];
        }
        const accessor = tagName === 'with-data' ? element.getAttribute('accessor') : undefined;
        if (accessor && accessor !== '.' && SIMPLE_PATH.test(accessor)) {
            const scope = resolveScopedPath(accessor, childScopes);
            if (scope) childScopes = [...childScopes, scope];
        }
        for (const child of element.childNodes) {
            if (child.nodeType === 3) {
                collectTextBindings(child.rawText, tagName ?? '', childScopes);
            } else if (child.nodeType === 1) {
                walk(child as HTMLElement, childScopes);
            }
        }
    }

    function collectTextBindings(text: string, element: string, scopes: BindingScope[]): void {
        for (const match of text.matchAll(TEXT_BINDING)) {
            const expression = match[1].trim();
            if (!SIMPLE_PATH.test(expression)) continue;
            const resolved = resolveScopedPath(expression, scopes);
            if (!resolved) continue;
            const tag = findTag(resolved.source.tags, resolved.prefix);
            if (!tag?.dataType || !isHtmlStringType(tag.dataType)) continue;
            const { key, suppressedOnImport } = resolved.source;
            bindings.push({
                qualifiedPath: key ? `${key}.${resolved.prefix}` : resolved.prefix,
                tagPath: resolved.prefix,
                element,
                suppressedOnImport,
            });
        }
    }

    walk(jayHtml.body, pageScopes);
    return bindings;
}

function pageSource(contract: Contract, contractPath: string | undefined): BindingSource {
    return {
        tags: resolveContractLinks(contract, contractPath).tags,
        suppressedOnImport: false,
    };
}

function findTag(tags: ContractTag[], tagPath: string): ContractTag | undefined {
    let current: ContractTag | undefined;
    let level: ContractTag[] | undefined = tags;
    for (const segment of tagPath.split('.')) {
        current = level?.find((t) => t.tag === segment);
        if (!current) return undefined;
        level = current.tags;
    }
    return current;
}
