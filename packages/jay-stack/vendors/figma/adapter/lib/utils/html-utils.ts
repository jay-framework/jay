import { InterchangeNode } from '@jay-framework/figma-interchange';

export function sanitizeHtmlId(name: string, id: string): string {
    // Replace any non-alphanumeric characters with hyphens
    let sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '-');

    // Ensure the ID starts with a letter
    if (!/^[a-zA-Z]/.test(sanitized)) {
        sanitized = 'id-' + sanitized;
    }

    // Convert to lowercase and append the Figma ID
    return `${sanitized}-${id}`.toLowerCase().replace(/:/g, '-');
}

export function wrapWithLink(htmlContent: string, link: any, depth: number): string {
    const indent = '  '.repeat(depth);
    const linkStyle =
        'display: block; width: fit-content; height: fit-content; text-decoration: none; color: inherit; box-sizing: border-box';
    const targetAttr = link.target ? ` target="${link.target}"` : '';

    // Phase 7: Interactions - Overlay Links
    let extraAttrs = '';
    let href = link.href;

    if (link.isOverlay && link.overlayId) {
        href = '#';
        extraAttrs = ` data-overlay-trigger="${link.overlayId}" onclick="document.getElementById('${link.overlayId}').style.display = 'block'; return false;"`;
    }

    return `${indent}<a href="${href}"${targetAttr}${extraAttrs} style="${linkStyle}">\n${htmlContent.trim()}\n${indent}</a>`;
}

export function getDirectives(node: InterchangeNode) {
    return node.jayData?.directives || [];
}

export function getBindings(node: InterchangeNode) {
    return node.jayData?.bindings || [];
}

export function shouldExportAsCompositeSvg(node: InterchangeNode): boolean {
    // Simple heuristic: if it's a Frame/Group with 'isCompositeSvg' in jayData
    // or if we have a specific way to identify vector groups.
    // For now, we rely on metadata that might be added by the plugin.
    // If the plugin doesn't set this, we return false.
    const anyNode = node as any;
    if (anyNode.jayData?.isCompositeSvg) {
        return true;
    }
    return false;
}
