/**
 * Design-System Index (DL#204)
 *
 * Catalogs every headless component an agent could flatten as a `<jay:X>` region: its contract and
 * the `.jay-html` template variants it ships. Two discovery sources, merged into one catalog:
 *   1. Local components under `componentsBase` (default `./src/components`).
 *   2. Plugin components (static `manifest.contracts`).
 *
 * Template↔contract association is by the template's *declared* contract reference
 * (`<script type="application/jay-data" contract="…">`), not by a filename convention: a `.jay-html`
 * is a variant of contract `X` iff its resolved `contract=` points at `X.jay-contract`. This handles
 * a directory holding several contracts correctly and needs no new naming rule.
 *
 * @see Design Log #204 — A design-system (region/template) index in the agent-kit
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { parse as parseHtml } from 'node-html-parser';
import { JAY_CONTRACT_EXTENSION, JAY_EXTENSION } from '@jay-framework/compiler-shared';
import type { ScannedPlugin } from '@jay-framework/stack-server-runtime';

// ============================================================================
// Types
// ============================================================================

/** One `.jay-html` template that renders a given contract. */
export interface TemplateVariant {
    /** Path to the `.jay-html` (absolute from the lookup helpers; project-relative in the emitted index). */
    path: string;
    /** Stable label: `''` for `<contract-basename>.jay-html`, else the filename stem (e.g. `card.feature`). */
    variant: string;
    /** From the template's `<title>` static text; omitted when empty or interpolation-only. */
    title?: string;
}

/** One component (contract) and every template that renders it. */
export interface DesignSystemComponentEntry {
    /** Contract name. */
    name: string;
    /** Path to the `.jay-contract` (project-relative in the emitted index). */
    contractPath: string;
    /** From the `.jay-contract` — a component-level property, read once (not per template). */
    description?: string;
    source: 'local' | 'plugin';
    /** Plugin name when `source === 'plugin'`. */
    plugin?: string;
    /** Every `.jay-html` whose `contractRef` resolves to this contract. */
    templates: TemplateVariant[];
}

export interface DesignSystemIndex {
    components: DesignSystemComponentEntry[];
}

// ============================================================================
// Template lookup (association by declared contract reference)
// ============================================================================

interface TemplateMeta {
    /** Absolute path the template's `contract=` resolves to, or undefined (inline data / no contract). */
    contractRef?: string;
    /** Static `<title>` text, or undefined. */
    title?: string;
}

/**
 * Reads a `.jay-html`'s declared contract reference and `<title>` in a single parse. Lightweight —
 * uses node-html-parser rather than the full jay compile pipeline, since we only need two fields.
 */
function readTemplateMeta(jayHtmlPath: string): TemplateMeta {
    let content: string;
    try {
        content = fs.readFileSync(jayHtmlPath, 'utf-8');
    } catch {
        return {};
    }
    const root = parseHtml(content);
    const ref = root
        .querySelector('script[type="application/jay-data"]')
        ?.getAttribute('contract');
    const contractRef = ref ? path.resolve(path.dirname(jayHtmlPath), ref) : undefined;

    const rawTitle = root.querySelector('title')?.text?.trim();
    // Drop `{…}` interpolations; a title that is empty or only interpolation has no static text.
    const staticTitle = rawTitle ? rawTitle.replace(/\{[^}]*\}/g, '').trim() : '';

    return { contractRef, title: staticTitle.length > 0 ? staticTitle : undefined };
}

/**
 * DL#204 — every template variant for the contract at `contractFile`. A template counts when its
 * resolved `contractRef` equals `contractFile` (reference match, not filename). Generalizes DL#200's
 * boolean `hasTemplateForContractFile`.
 */
export function listTemplatesForContractFile(contractFile: string | undefined): TemplateVariant[] {
    if (!contractFile) return [];
    const dir = path.dirname(contractFile);
    const target = path.resolve(contractFile);
    const contractBasename = path.basename(contractFile, JAY_CONTRACT_EXTENSION);

    let names: string[];
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }

    const variants: TemplateVariant[] = [];
    for (const f of names) {
        if (!f.endsWith(JAY_EXTENSION)) continue;
        const jayHtmlPath = path.join(dir, f);
        const meta = readTemplateMeta(jayHtmlPath);
        if (meta.contractRef !== target) continue; // not a template for this contract
        const stem = path.basename(f, JAY_EXTENSION);
        variants.push({
            path: jayHtmlPath,
            variant: stem === contractBasename ? '' : stem,
            ...(meta.title && { title: meta.title }),
        });
    }
    // Base template (`''`) first, then variants alphabetically — stable output for fixtures.
    return variants.sort((a, b) => a.variant.localeCompare(b.variant));
}

/** DL#200/204 — does any `.jay-html` render this contract? Thin wrapper over the enumeration. */
export function hasTemplateForContractFile(contractFile: string | undefined): boolean {
    return listTemplatesForContractFile(contractFile).length > 0;
}

// ============================================================================
// Index construction
// ============================================================================

function readContractField(contractFile: string, field: string): string | undefined {
    try {
        const parsed = YAML.parse(fs.readFileSync(contractFile, 'utf-8'));
        const value = parsed?.[field];
        return typeof value === 'string' ? value : undefined;
    } catch {
        return undefined;
    }
}

function findContractFilesSync(dir: string): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...findContractFilesSync(full));
        else if (entry.name.endsWith(JAY_CONTRACT_EXTENSION)) out.push(full);
    }
    return out.sort();
}

export interface BuildDesignSystemIndexOptions {
    projectRoot: string;
    /** Local component root; default `./src/components` (same base `validate`/`sync` use). */
    componentsBase?: string;
    /** Scanned plugins (reuse the same scan plugins-index did). */
    plugins: Map<string, ScannedPlugin>;
    /** Resolves a plugin contract spec to an absolute `.jay-contract` path (shared with the materializer). */
    resolvePluginContractPath: (plugin: ScannedPlugin, contractSpec: string) => string;
}

/**
 * DL#204 — build the catalog from the two discovery sources. Dynamic (generated) plugin contracts are
 * not included: they are materialized into agent-kit and have no co-located `.jay-html` to flatten.
 */
export function buildDesignSystemIndex(options: BuildDesignSystemIndexOptions): DesignSystemIndex {
    const { projectRoot, plugins, resolvePluginContractPath } = options;
    const componentsBase = options.componentsBase
        ? path.resolve(projectRoot, options.componentsBase)
        : path.join(projectRoot, 'src', 'components');

    const rel = (p: string): string => './' + path.relative(projectRoot, p).replace(/\\/g, '/');

    const makeEntry = (
        contractFile: string,
        source: 'local' | 'plugin',
        pluginName: string | undefined,
        nameOverride?: string,
    ): DesignSystemComponentEntry => {
        const name =
            nameOverride ??
            readContractField(contractFile, 'name') ??
            path.basename(contractFile, JAY_CONTRACT_EXTENSION);
        const description = readContractField(contractFile, 'description');
        const templates = listTemplatesForContractFile(contractFile).map((t) => ({
            ...t,
            path: rel(t.path),
        }));
        return {
            name,
            contractPath: rel(contractFile),
            ...(description && { description }),
            source,
            ...(pluginName && { plugin: pluginName }),
            templates,
        };
    };

    const components: DesignSystemComponentEntry[] = [];

    // 1. Local components.
    for (const contractFile of findContractFilesSync(componentsBase)) {
        components.push(makeEntry(contractFile, 'local', undefined));
    }

    // 2. Plugin components (static contracts).
    for (const [, plugin] of plugins) {
        const contracts = plugin.manifest.contracts;
        if (!Array.isArray(contracts)) continue;
        for (const contract of contracts) {
            const spec = contract.contract;
            if (!spec) continue;
            const contractFile = resolvePluginContractPath(plugin, spec);
            components.push(makeEntry(contractFile, 'plugin', plugin.name, contract.name));
        }
    }

    return { components };
}

// ============================================================================
// Add-menu doc
// ============================================================================

function toKebabCase(str: string): string {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/^-/, '');
}

/**
 * DL#204 — render the human/agent "add-menu": the `<title>` catalog of components and their template
 * variants, each with a paste-ready `template=` import + `<jay:X>` region. Generated from the same
 * `DesignSystemIndex` object, so it can never drift from the YAML.
 */
export function renderAddMenu(index: DesignSystemIndex): string {
    const lines: string[] = [];
    lines.push('# Design-system elements you can add');
    lines.push('');
    lines.push('Generated by `jay-stack agent-kit`. Each component ships a contract and one or more');
    lines.push('`.jay-html` templates you can flatten into a page as a `<jay:X>` region. Pick a variant,');
    lines.push('paste its import + region, then run `jay-stack sync` to flatten the markup. See');
    lines.push('`designer/design-system-guide.md`.');
    lines.push('');

    if (index.components.length === 0) {
        lines.push('_No design-system components found._');
        lines.push('');
        return lines.join('\n');
    }

    for (const component of index.components) {
        lines.push(
            component.description
                ? `## ${component.name} — ${component.description}`
                : `## ${component.name}`,
        );
        lines.push('');

        if (component.templates.length === 0) {
            lines.push(
                "_No template yet (COMPONENT-NO-TEMPLATE) — this component can't be flattened until it ships a `.jay-html`._",
            );
            lines.push('');
            continue;
        }

        lines.push('| Variant | Title | Template |');
        lines.push('| --- | --- | --- |');
        for (const template of component.templates) {
            const variant = template.variant === '' ? '(default)' : template.variant;
            lines.push(`| ${variant} | ${template.title ?? ''} | ${template.path} |`);
        }
        lines.push('');

        const first = component.templates[0];
        const regionTag = toKebabCase(component.name);
        const contractAttr = component.source === 'plugin' ? component.name : component.contractPath;
        lines.push('```html');
        lines.push('<script');
        lines.push('  type="application/jay-headless"');
        if (component.source === 'plugin' && component.plugin) {
            lines.push(`  plugin="${component.plugin}"`);
        }
        lines.push(`  contract="${contractAttr}"`);
        lines.push(`  template="${first.path}"`);
        lines.push('></script>');
        lines.push('');
        lines.push(
            `<jay:${regionTag} ref="${regionTag}"><!-- flattened copy; edit freely --></jay:${regionTag}>`,
        );
        lines.push('```');
        lines.push('');
        lines.push('Then run `jay-stack sync` to flatten it.');
        lines.push('');
    }

    return lines.join('\n');
}
