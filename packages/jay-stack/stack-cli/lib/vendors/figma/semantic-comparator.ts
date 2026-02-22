/**
 * Semantic comparator for roundtrip testing.
 * Compares jay-html content for semantic equivalence (not byte-identical).
 */

export interface InvariantResult {
    id: string;
    name: string;
    passed: boolean;
    severity: 'HARD_FAIL' | 'WARN';
    details?: string;
}

export interface SemanticComparisonResult {
    equivalent: boolean;
    invariantResults: InvariantResult[];
    normalizedSource: string;
    normalizedActual: string;
}

/**
 * Normalizes HTML for comparison using regex-based string manipulation.
 */
function normalizeHtml(html: string): string {
    let result = html;

    // N8: Strip HTML comments
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // N1: Collapse whitespace runs to single space; trim lines; remove blank lines
    result = result
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0)
        .join('\n');

    // N4: Remove data-figma-id and data-figma-type attributes
    result = result.replace(/\s+data-figma-id="[^"]*"/g, '');
    result = result.replace(/\s+data-figma-type="[^"]*"/g, '');

    // N5: Remove id attributes matching Figma node ID pattern (\d+:\d+)
    result = result.replace(/\s+id="\d+:\d+"/g, '');

    // N6: Remove attributes with empty string values
    result = result.replace(/\s+(\w+)=""/g, '');

    // N2: Sort attributes alphabetically within each element
    result = result.replace(/<(\w+)([^>]*)>/g, (_, tagName, attrs) => {
        if (!attrs.trim()) return `<${tagName}>`;
        const attrList = attrs
            .trim()
            .split(/\s+(?=\w+=)/)
            .filter((a: string) => a.length > 0);
        const parsed: Array<{ name: string; value: string }> = [];
        for (const a of attrList) {
            const eq = a.indexOf('=');
            if (eq > 0) {
                const name = a.slice(0, eq).trim();
                const value = a.slice(eq + 1).trim();
                parsed.push({ name, value });
            }
        }
        parsed.sort((x, y) => x.name.localeCompare(y.name));
        const sortedAttrs = parsed.map((p) => `${p.name}=${p.value}`).join(' ');
        return `<${tagName} ${sortedAttrs}>`;
    });

    // N3: Parse style attribute; sort properties alphabetically
    result = result.replace(/style="([^"]*)"/g, (_, styleContent) => {
        const props = styleContent
            .split(';')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);
        const parsed: Array<{ key: string; value: string }> = [];
        for (const p of props) {
            const colon = p.indexOf(':');
            if (colon > 0) {
                parsed.push({
                    key: p.slice(0, colon).trim(),
                    value: p.slice(colon + 1).trim(),
                });
            }
        }
        parsed.sort((x, y) => x.key.localeCompare(y.key));
        const sortedStyle = parsed.map((p) => `${p.key}: ${p.value}`).join('; ');
        return `style="${sortedStyle}"`;
    });

    // N7: Normalize self-closing tags (<br> vs <br/>)
    result = result.replace(/<br\s*\/?>/gi, '<br/>');
    result = result.replace(/<img([^>]*)\s*\/?>/gi, (_, attrs) => `<img${attrs}/>`);
    result = result.replace(/<input([^>]*)\s*\/?>/gi, (_, attrs) => `<input${attrs}/>`);

    return result;
}

/**
 * Extracts ref="X" values from HTML.
 */
function extractRefs(html: string): string[] {
    const refs: string[] = [];
    const re = /ref="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        refs.push(m[1]);
    }
    return [...new Set(refs)];
}

/**
 * Extracts {path} text expressions from text content (not inside attribute values).
 * Splits by > and < to get text segments, then finds {x} in those.
 */
function extractTextBindings(html: string): string[] {
    const bindings: string[] = [];
    const segments = html.split(/(?=[<>])/);
    let inTag = false;
    for (const seg of segments) {
        if (seg.startsWith('<')) inTag = true;
        else if (seg.startsWith('>')) inTag = false;
        else if (!inTag) {
            const re = /\{([^}]+)\}/g;
            let m;
            while ((m = re.exec(seg)) !== null) {
                bindings.push(m[1]);
            }
        }
    }
    return [...new Set(bindings)];
}

/**
 * Extracts attr="{path}" attribute bindings (src, alt, href, value, placeholder).
 */
function extractAttributeBindings(html: string): string[] {
    const bindings: string[] = [];
    const re = /(src|alt|href|value|placeholder)="\{([^}]+)\}"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        bindings.push(m[2]);
    }
    return [...new Set(bindings)];
}

/**
 * Extracts significant static text content (>3 chars, not just whitespace) from HTML.
 * Excludes pure binding expressions like {path}.
 */
function extractSignificantText(html: string): string[] {
    const texts: string[] = [];
    const textMatches = html.matchAll(/>([^<]+)</g);
    for (const m of textMatches) {
        const raw = m[1].trim();
        if (raw.length <= 3) continue;
        if (/^\s*\{[^}]*\}\s*$/.test(raw)) continue; // Pure binding - skip
        const staticParts = raw
            .split(/\{[^}]*\}/)
            .map((s) => s.trim())
            .filter(Boolean);
        for (const part of staticParts) {
            if (part.length > 3) texts.push(part);
        }
        if (staticParts.length === 0 && raw.length > 3) texts.push(raw);
    }
    return [...new Set(texts)];
}

/**
 * Extracts if="condition" attribute values from HTML.
 */
function extractIfConditions(html: string): string[] {
    const conditions: string[] = [];
    const re = /if="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        conditions.push(m[1].trim());
    }
    return conditions;
}

/**
 * Extracts forEach="collection" trackBy="key" pairs from HTML.
 * Returns array of { forEach, trackBy } objects.
 */
function extractRepeaters(html: string): Array<{ forEach: string; trackBy: string | null }> {
    const repeaters: Array<{ forEach: string; trackBy: string | null }> = [];
    const re = /forEach="([^"]+)"(?:\s+[^>]*?)?(?:\s+trackBy="([^"]+)")?/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        repeaters.push({ forEach: m[1].trim(), trackBy: m[2]?.trim() ?? null });
    }
    return repeaters;
}

/**
 * Extracts <script type="application/jay-headless" ...> tags and their key attributes.
 * Returns array of { plugin, contract, key } objects.
 */
function extractHeadlessScripts(
    html: string,
): Array<{ plugin: string; contract: string; key: string }> {
    const scripts: Array<{ plugin: string; contract: string; key: string }> = [];
    const re = /<script[^>]*type="application\/jay-headless"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const pluginMatch = tag.match(/plugin="([^"]+)"/);
        const contractMatch = tag.match(/contract="([^"]+)"/);
        const keyMatch = tag.match(/key="([^"]+)"/);
        if (pluginMatch && contractMatch && keyMatch) {
            scripts.push({
                plugin: pluginMatch[1],
                contract: contractMatch[1],
                key: keyMatch[1],
            });
        }
    }
    return scripts;
}

/**
 * Checks if a string contains another (for text content preservation).
 */
function containsText(haystack: string, needle: string): boolean {
    const normalizedHaystack = haystack.replace(/\s+/g, ' ').trim();
    const normalizedNeedle = needle.replace(/\s+/g, ' ').trim();
    return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * Compares two jay-html strings for semantic equivalence.
 */
export function compareSemanticEquivalence(
    sourceJayHtml: string,
    exportedJayHtml: string,
): SemanticComparisonResult {
    const normalizedSource = normalizeHtml(sourceJayHtml);
    const normalizedActual = normalizeHtml(exportedJayHtml);

    const invariantResults: InvariantResult[] = [];
    let equivalent = true;

    // SI-2: Every ref="X" in source exists in output
    const sourceRefs = extractRefs(normalizedSource);
    for (const ref of sourceRefs) {
        const inOutput = normalizedActual.includes(`ref="${ref}"`);
        invariantResults.push({
            id: 'SI-2',
            name: `ref="${ref}"`,
            passed: inOutput,
            severity: 'HARD_FAIL',
            details: inOutput ? undefined : `ref="${ref}" not found in exported HTML`,
        });
        if (!inOutput) equivalent = false;
    }

    // SI-3: Every {path} text expression in source exists in output
    const sourceTextBindings = extractTextBindings(normalizedSource);
    for (const path of sourceTextBindings) {
        const inOutput = normalizedActual.includes(`{${path}}`);
        invariantResults.push({
            id: 'SI-3',
            name: `text binding {${path}}`,
            passed: inOutput,
            severity: 'HARD_FAIL',
            details: inOutput ? undefined : `{${path}} not found in exported HTML`,
        });
        if (!inOutput) equivalent = false;
    }

    // SI-4: Every attr="{path}" attribute binding in source exists in output
    const sourceAttrBindings = extractAttributeBindings(normalizedSource);
    for (const path of sourceAttrBindings) {
        const inOutput = normalizedActual.includes(`{${path}}`);
        invariantResults.push({
            id: 'SI-4',
            name: `attr binding {${path}}`,
            passed: inOutput,
            severity: 'HARD_FAIL',
            details: inOutput ? undefined : `attr="{${path}}" not found in exported HTML`,
        });
        if (!inOutput) equivalent = false;
    }

    // SI-5: Every if="condition" semantically preserved
    const sourceIfConditions = extractIfConditions(normalizedSource);
    for (const condition of sourceIfConditions) {
        const inOutput = normalizedActual.includes(`if="${condition}"`);
        invariantResults.push({
            id: 'SI-5',
            name: `if="${condition}"`,
            passed: inOutput,
            severity: 'HARD_FAIL',
            details: inOutput ? undefined : `if="${condition}" not found in exported HTML`,
        });
        if (!inOutput) equivalent = false;
    }

    // SI-6: Every forEach + trackBy preserved
    const sourceRepeaters = extractRepeaters(normalizedSource);
    for (const repeater of sourceRepeaters) {
        const forEachFound = normalizedActual.includes(`forEach="${repeater.forEach}"`);
        invariantResults.push({
            id: 'SI-6',
            name: `forEach="${repeater.forEach}"`,
            passed: forEachFound,
            severity: 'HARD_FAIL',
            details: forEachFound
                ? undefined
                : `forEach="${repeater.forEach}" not found in exported HTML`,
        });
        if (!forEachFound) equivalent = false;

        if (repeater.trackBy) {
            const trackByFound = normalizedActual.includes(`trackBy="${repeater.trackBy}"`);
            invariantResults.push({
                id: 'SI-6',
                name: `trackBy="${repeater.trackBy}" (for forEach="${repeater.forEach}")`,
                passed: trackByFound,
                severity: 'HARD_FAIL',
                details: trackByFound
                    ? undefined
                    : `trackBy="${repeater.trackBy}" not found in exported HTML`,
            });
            if (!trackByFound) equivalent = false;
        }
    }

    // SI-10: application/jay-headless scripts preserved
    const sourceHeadlessScripts = extractHeadlessScripts(sourceJayHtml);
    for (const script of sourceHeadlessScripts) {
        const keyInOutput = exportedJayHtml.includes(`key="${script.key}"`);
        const pluginInOutput = exportedJayHtml.includes(`plugin="${script.plugin}"`);
        const contractInOutput = exportedJayHtml.includes(`contract="${script.contract}"`);
        const allFound = keyInOutput && pluginInOutput && contractInOutput;
        invariantResults.push({
            id: 'SI-10',
            name: `jay-headless plugin="${script.plugin}" key="${script.key}"`,
            passed: allFound,
            severity: 'HARD_FAIL',
            details: allFound
                ? undefined
                : `jay-headless script (plugin="${script.plugin}", contract="${script.contract}", key="${script.key}") not fully preserved`,
        });
        if (!allFound) equivalent = false;
    }

    // SI-9: Static text content preserved verbatim
    const sourceTexts = extractSignificantText(normalizedSource);
    for (const text of sourceTexts) {
        const inOutput = containsText(normalizedActual, text);
        invariantResults.push({
            id: 'SI-9',
            name: `static text "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`,
            passed: inOutput,
            severity: 'HARD_FAIL',
            details: inOutput ? undefined : `Static text not found in exported HTML`,
        });
        if (!inOutput) equivalent = false;
    }

    return {
        equivalent,
        invariantResults,
        normalizedSource,
        normalizedActual,
    };
}
