import type { JayHtmlValidationContext } from './plugin-validators';

export interface TemplatePart {
    kind: 'static' | 'binding';
    value: string;
}

export interface DataScope {
    tags: Array<{ tag: string; tags?: any[]; meta?: Record<string, string>; [key: string]: any }>;
    parent?: DataScope;
}

export interface ResolvedBinding {
    path: string;
    tag?: { tag: string; meta?: Record<string, string>; [key: string]: any };
}

export function resolveBinding(bindingPath: string, scope: DataScope): ResolvedBinding {
    const segments = bindingPath.split('.');
    let tags = scope.tags;

    for (let i = 0; i < segments.length; i++) {
        const match = tags.find((t) => t.tag === segments[i]);
        if (!match) return { path: bindingPath };
        if (i === segments.length - 1) return { path: bindingPath, tag: match };
        if (!match.tags) return { path: bindingPath };
        tags = match.tags;
    }

    return { path: bindingPath };
}

function resolveTagPath(
    dotPath: string,
    tags: Array<{ tag: string; tags?: any[]; [key: string]: any }>,
): { tag: string; tags?: any[]; [key: string]: any } | undefined {
    const segments = dotPath.split('.');
    let currentTags = tags;
    for (let i = 0; i < segments.length; i++) {
        const match = currentTags.find((t) => t.tag === segments[i]);
        if (!match) return undefined;
        if (i === segments.length - 1) return match;
        if (!match.tags) return undefined;
        currentTags = match.tags;
    }
    return undefined;
}

export function walkElements(
    root: any,
    ctx: JayHtmlValidationContext,
    visitor: (el: any, scope: DataScope) => void,
): void {
    const pageScope: DataScope = {
        tags: ctx.contract?.tags ?? [],
    };
    doWalk(root, ctx, pageScope, visitor);
}

function doWalk(
    el: any,
    ctx: JayHtmlValidationContext,
    scope: DataScope,
    visitor: (el: any, scope: DataScope) => void,
): void {
    let currentScope = scope;

    const tagName: string | undefined = el.rawTagName?.toLowerCase();

    if (tagName?.startsWith('jay:')) {
        const contractName = tagName.substring(4);
        const headless = ctx.headlessImports.find(
            (h) => h.contractName === contractName && h.contract,
        );
        if (headless?.contract) {
            currentScope = {
                tags: headless.contract.tags,
                parent: scope,
            };
        }
    }

    const forEach = el.getAttribute?.('forEach');
    if (forEach) {
        let arrayTag = resolveTagPath(forEach, currentScope.tags);
        if (!arrayTag) {
            const segments = forEach.split('.');
            const headless = ctx.headlessImports.find((h) => h.key === segments[0] && h.contract);
            if (headless?.contract && segments.length > 1) {
                arrayTag = resolveTagPath(segments.slice(1).join('.'), headless.contract.tags);
            }
        }
        if (arrayTag?.tags) {
            currentScope = {
                tags: arrayTag.tags,
                parent: currentScope,
            };
        }
    }

    visitor(el, currentScope);

    for (const child of el.childNodes ?? []) {
        if (child.nodeType === 1) {
            doWalk(child, ctx, currentScope, visitor);
        }
    }
}
