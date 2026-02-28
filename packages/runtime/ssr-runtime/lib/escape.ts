const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/**
 * HTML-escape a string for safe embedding in HTML content.
 * Escapes: & < > " '
 */
export function escapeHtml(str: string): string {
    return String(str).replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * HTML-escape a string for safe embedding in attribute values.
 * Same escaping as escapeHtml — covers all characters that could break
 * out of single-quoted, double-quoted, or unquoted attribute values.
 */
export function escapeAttr(str: string): string {
    return String(str).replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char]);
}
