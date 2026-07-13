/** Add Menu catalog schema validation and lint for validate-plugin. */

export type AddMenuCatalogLintWarning = {
    code: string;
    message: string;
    itemId?: string;
    sourcePath?: string;
};

export type AddMenuValidationError = {
    path: string;
    message: string;
    code?: string;
};

export type AddMenuItem = {
    id: string;
    title: string;
    category: string;
    prompt: string;
    pluginName?: string;
    packageName?: string;
    subCategory?: string;
    thumbnail?: string;
    presentation?: AddMenuPresentation;
};

type AddMenuPresentation =
    | { type: 'image'; src: string }
    | { type: 'gif'; src: string; poster?: string }
    | { type: 'html-fragment'; html: string };

const REJECTED_ITEM_FIELDS = ['kind', 'parameters', 'component', 'allowedScopes'] as const;
const HTML_SOFT_LIMIT_BYTES = 8 * 1024;
const HTML_HARD_LIMIT_BYTES = 32 * 1024;

const BLOCKED_TAGS =
    /<\s*(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\s*\1\s*>|<\s*(script|iframe|object|embed)\b[^>]*\/?>/gi;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /\b(href|src|xlink:href)\s*=\s*("|')\s*javascript:/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function byteLengthUtf8(value: string): number {
    return new TextEncoder().encode(value).length;
}

function detectUnsafeAddMenuHtmlFragment(html: string): { code: string; message: string } | null {
    if (BLOCKED_TAGS.test(html)) {
        BLOCKED_TAGS.lastIndex = 0;
        return {
            code: 'html-fragment-unsafe-markup',
            message: 'html-fragment must not include script, iframe, object, or embed',
        };
    }
    BLOCKED_TAGS.lastIndex = 0;

    if (EVENT_HANDLER_ATTR.test(html)) {
        EVENT_HANDLER_ATTR.lastIndex = 0;
        return {
            code: 'html-fragment-unsafe-markup',
            message: 'html-fragment must not include inline event handler attributes',
        };
    }
    EVENT_HANDLER_ATTR.lastIndex = 0;

    if (JAVASCRIPT_URL.test(html)) {
        JAVASCRIPT_URL.lastIndex = 0;
        return {
            code: 'html-fragment-unsafe-markup',
            message: 'html-fragment must not include javascript: URLs',
        };
    }
    JAVASCRIPT_URL.lastIndex = 0;

    return null;
}

function sanitizeAddMenuHtmlFragment(html: string): string {
    let result = html;
    result = result.replace(BLOCKED_TAGS, '');
    BLOCKED_TAGS.lastIndex = 0;
    result = result.replace(EVENT_HANDLER_ATTR, '');
    EVENT_HANDLER_ATTR.lastIndex = 0;
    result = result.replace(JAVASCRIPT_URL, '');
    JAVASCRIPT_URL.lastIndex = 0;
    return result.trim();
}

function catalogWarning(
    code: string,
    message: string,
    itemId?: string,
    sourcePath?: string,
): AddMenuCatalogLintWarning {
    return { code, message, ...(itemId ? { itemId } : {}), ...(sourcePath ? { sourcePath } : {}) };
}

function requiredString(
    obj: Record<string, unknown>,
    field: string,
    itemPath: string,
    errors: AddMenuValidationError[],
): string | null {
    const value = obj[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push({
            path: `${itemPath}.${field}`,
            message: 'required non-empty string',
        });
        return null;
    }
    return value.trim();
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
    const value = obj[field];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function validatePresentation(
    raw: unknown,
    itemPath: string,
    errors: AddMenuValidationError[],
): AddMenuPresentation | undefined {
    if (raw === undefined) return undefined;
    if (!isRecord(raw)) {
        errors.push({ path: itemPath, message: 'presentation must be an object' });
        return undefined;
    }

    const type = raw.type;
    if (type !== 'image' && type !== 'gif' && type !== 'html-fragment') {
        errors.push({
            path: `${itemPath}.type`,
            message: 'presentation.type must be "image", "gif", or "html-fragment"',
            code: 'presentation-unknown-type',
        });
        return undefined;
    }

    if (type === 'image') {
        const src = requiredString(raw, 'src', itemPath, errors);
        if (!src) return undefined;
        return { type: 'image', src };
    }

    if (type === 'gif') {
        const src = requiredString(raw, 'src', itemPath, errors);
        if (!src) return undefined;
        return {
            type: 'gif',
            src,
            poster: optionalString(raw, 'poster'),
        };
    }

    if ('src' in raw) {
        errors.push({
            path: `${itemPath}.src`,
            message: 'html-fragment must use presentation.html, not presentation.src',
            code: 'html-fragment-src-not-allowed',
        });
    }

    const htmlValue = raw.html;
    if (typeof htmlValue !== 'string' || htmlValue.trim().length === 0) {
        errors.push({
            path: `${itemPath}.html`,
            message: 'html-fragment requires non-empty presentation.html',
            code: 'html-fragment-missing-html',
        });
        return undefined;
    }

    const unsafe = detectUnsafeAddMenuHtmlFragment(htmlValue);
    if (unsafe) {
        errors.push({
            path: `${itemPath}.html`,
            message: unsafe.message,
            code: unsafe.code,
        });
        return undefined;
    }

    const sanitized = sanitizeAddMenuHtmlFragment(htmlValue);
    if (byteLengthUtf8(sanitized) > HTML_HARD_LIMIT_BYTES) {
        errors.push({
            path: `${itemPath}.html`,
            message: `html-fragment exceeds ${HTML_HARD_LIMIT_BYTES} bytes after sanitize`,
            code: 'html-fragment-oversize-hard',
        });
        return undefined;
    }

    return { type: 'html-fragment', html: htmlValue };
}

export function validateAddMenuItem(
    raw: unknown,
    itemPath: string,
): { item: AddMenuItem | null; errors: AddMenuValidationError[] } {
    const errors: AddMenuValidationError[] = [];
    if (!isRecord(raw)) {
        return {
            item: null,
            errors: [{ path: itemPath, message: 'item must be an object' }],
        };
    }

    for (const field of REJECTED_ITEM_FIELDS) {
        if (field in raw) {
            errors.push({
                path: `${itemPath}.${field}`,
                message: `field "${field}" is not allowed in Add Menu catalog items`,
            });
        }
    }

    const id = requiredString(raw, 'id', itemPath, errors);
    const title = requiredString(raw, 'title', itemPath, errors);
    const category = requiredString(raw, 'category', itemPath, errors);
    const prompt = requiredString(raw, 'prompt', itemPath, errors);
    if (errors.length > 0 || !id || !title || !category || !prompt) {
        return { item: null, errors };
    }

    const presentation = validatePresentation(raw.presentation, `${itemPath}.presentation`, errors);
    if (errors.length > 0) {
        return { item: null, errors };
    }

    return {
        item: {
            id,
            title,
            category,
            prompt,
            pluginName: optionalString(raw, 'pluginName'),
            packageName: optionalString(raw, 'packageName'),
            subCategory: optionalString(raw, 'subCategory'),
            thumbnail: optionalString(raw, 'thumbnail'),
            ...(presentation ? { presentation } : {}),
        },
        errors,
    };
}

export function validateAddMenuCatalogFile(
    raw: unknown,
    sourcePath: string,
): { file: { items: AddMenuItem[] } | null; errors: AddMenuValidationError[] } {
    const errors: AddMenuValidationError[] = [];
    if (!isRecord(raw)) {
        return {
            file: null,
            errors: [{ path: sourcePath, message: 'catalog file must be an object' }],
        };
    }
    if (!Array.isArray(raw.items)) {
        return {
            file: null,
            errors: [{ path: `${sourcePath}.items`, message: 'items must be an array' }],
        };
    }

    const items: AddMenuItem[] = [];
    raw.items.forEach((entry, index) => {
        const result = validateAddMenuItem(entry, `${sourcePath}.items[${index}]`);
        errors.push(...result.errors);
        if (result.item) items.push(result.item);
    });

    if (items.length === 0 && errors.length > 0) {
        return { file: null, errors };
    }
    return { file: { items }, errors };
}

function normalizeAddMenuPresentation(item: AddMenuItem): AddMenuPresentation | undefined {
    if (item.presentation) return item.presentation;
    const thumbnail = item.thumbnail?.trim();
    if (!thumbnail) return undefined;
    if (/\.gif$/i.test(thumbnail)) {
        return { type: 'gif', src: thumbnail };
    }
    return { type: 'image', src: thumbnail };
}

function hasSingleRootDiv(html: string): boolean {
    const trimmed = html.trim();
    if (!trimmed.startsWith('<div')) return false;
    const openMatch = trimmed.match(/^<div\b[^>]*>/i);
    if (!openMatch) return false;
    const afterOpen = trimmed.slice(openMatch[0].length);
    const closeIdx = afterOpen.lastIndexOf('</div>');
    if (closeIdx < 0) return false;
    const tail = afterOpen.slice(closeIdx + '</div>'.length).trim();
    return tail.length === 0;
}

function hasAtScopeStyle(html: string): boolean {
    return /<style\b[^>]*>[\s\S]*@scope\b/i.test(html);
}

function lintHtmlFragment(
    item: AddMenuItem,
    sourcePath: string,
): { errors: AddMenuCatalogLintWarning[]; warnings: AddMenuCatalogLintWarning[] } {
    const errors: AddMenuCatalogLintWarning[] = [];
    const warnings: AddMenuCatalogLintWarning[] = [];
    const presentation = item.presentation;
    if (!presentation || presentation.type !== 'html-fragment') {
        return { errors, warnings };
    }

    const rawHtml = presentation.html?.trim() ?? '';
    if (!rawHtml) {
        errors.push(
            catalogWarning(
                'html-fragment-missing-html',
                'html-fragment requires non-empty presentation.html',
                item.id,
                sourcePath,
            ),
        );
        return { errors, warnings };
    }

    const unsafe = detectUnsafeAddMenuHtmlFragment(rawHtml);
    if (unsafe) {
        errors.push(catalogWarning(unsafe.code, unsafe.message, item.id, sourcePath));
        return { errors, warnings };
    }

    const sanitized = sanitizeAddMenuHtmlFragment(rawHtml);
    const bytes = byteLengthUtf8(sanitized);
    if (bytes > HTML_HARD_LIMIT_BYTES) {
        errors.push(
            catalogWarning(
                'html-fragment-oversize-hard',
                `html-fragment exceeds ${HTML_HARD_LIMIT_BYTES} bytes after sanitize (${bytes})`,
                item.id,
                sourcePath,
            ),
        );
    } else if (bytes > HTML_SOFT_LIMIT_BYTES) {
        warnings.push(
            catalogWarning(
                'html-fragment-oversize-soft',
                `html-fragment exceeds ${HTML_SOFT_LIMIT_BYTES} bytes after sanitize (${bytes}) — consider trimming`,
                item.id,
                sourcePath,
            ),
        );
    }

    if (!hasSingleRootDiv(sanitized)) {
        warnings.push(
            catalogWarning(
                'html-fragment-missing-root-div',
                'html-fragment should use a single root <div>',
                item.id,
                sourcePath,
            ),
        );
    }

    if (!hasAtScopeStyle(sanitized)) {
        warnings.push(
            catalogWarning(
                'html-fragment-missing-at-scope',
                'html-fragment should include <style> with @scope for preview isolation',
                item.id,
                sourcePath,
            ),
        );
    }

    return { errors, warnings };
}

function lintGifPoster(item: AddMenuItem, sourcePath: string): AddMenuCatalogLintWarning[] {
    const presentation = normalizeAddMenuPresentation(item);
    if (presentation?.type !== 'gif' || presentation.poster?.trim()) return [];
    return [
        catalogWarning(
            'gif-missing-poster',
            `gif item "${item.id}" has no poster — add poster for prefers-reduced-motion accessibility`,
            item.id,
            sourcePath,
        ),
    ];
}

export function lintAddMenuCatalog(
    items: AddMenuItem[],
    sourcePath: string,
): { errors: AddMenuCatalogLintWarning[]; warnings: AddMenuCatalogLintWarning[] } {
    const errors: AddMenuCatalogLintWarning[] = [];
    const warnings: AddMenuCatalogLintWarning[] = [];

    for (const item of items) {
        warnings.push(...lintGifPoster(item, sourcePath));
        const htmlLint = lintHtmlFragment(item, sourcePath);
        errors.push(...htmlLint.errors);
        warnings.push(...htmlLint.warnings);
    }

    return { errors, warnings };
}
