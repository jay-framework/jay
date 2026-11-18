/**
 * DL#238 — project-level checks of each local plugin's page-wide `styles` and the token use in its
 * component templates. All findings are warnings; NPM plugins are not checked.
 */
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import type { ProjectValidatorFn, ProjectValidationFinding } from '@jay-framework/compiler-shared';
import {
    extractStyleBlocks,
    listLocalPluginThemes,
    readExistingStyles,
    type LocalPluginTheme,
} from '../local-plugin-themes.js';

const VAR_REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g;

export const validatePluginThemes: ProjectValidatorFn = ({ projectRoot }) =>
    listLocalPluginThemes(projectRoot).flatMap((theme) => checkPluginTheme(projectRoot, theme));

function checkPluginTheme(
    projectRoot: string,
    theme: LocalPluginTheme,
): ProjectValidationFinding[] {
    const relative = (file: string) => path.relative(projectRoot, file).replace(/\\/g, '/');
    const styles = readExistingStyles(theme);
    const definedTokens = new Set(styles.flatMap((style) => declaredCustomProperties(style.css)));
    const tokenUses = findTemplateTokenUses(theme.dir);
    return [
        ...themeMissing(theme, tokenUses, relative),
        ...tokenUses
            .filter((use) => !use.hasFallback && !definedTokens.has(use.token))
            .map((use) => tokenWithoutFallback(use, relative)),
        ...theme.styleFiles
            .filter((file) => !file.exists)
            .map((file) => styleFileMissing(theme, file.declared, relative)),
        ...styles.flatMap((style) =>
            plainRootLines(style.css).map((line) => plainRootTokens(relative(style.path), line)),
        ),
    ];
}

interface TokenUse {
    token: string;
    hasFallback: boolean;
    file: string;
    line: number;
}

function themeMissing(
    theme: LocalPluginTheme,
    tokenUses: TokenUse[],
    relative: (file: string) => string,
): ProjectValidationFinding[] {
    const prefix = `--${theme.folder}-`;
    if (theme.declaresStyles || !tokenUses.some((use) => use.token.startsWith(prefix))) return [];
    return [
        {
            severity: 'warning',
            file: relative(path.join(theme.dir, 'plugin.yaml')),
            message: `DS-THEME-MISSING: plugin "${theme.folder}" templates use ${prefix}* tokens but plugin.yaml declares no \`styles\``,
            suggestion:
                'Put the tokens in a stylesheet under `:where(:root) { … }` and list it in plugin.yaml `styles: [theme.css]`.',
        },
    ];
}

function tokenWithoutFallback(
    use: TokenUse,
    relative: (file: string) => string,
): ProjectValidationFinding {
    return {
        severity: 'warning',
        file: relative(use.file),
        message: `DS-TOKEN-NO-FALLBACK: var(${use.token}) at line ${use.line} has no fallback and is not defined in the plugin's \`styles\``,
        suggestion: `Define ${use.token} in the plugin stylesheet, or add a fallback: var(${use.token}, <value>).`,
    };
}

function styleFileMissing(
    theme: LocalPluginTheme,
    declared: string,
    relative: (file: string) => string,
): ProjectValidationFinding {
    return {
        severity: 'warning',
        file: relative(path.join(theme.dir, 'plugin.yaml')),
        message: `DS-THEME-FILE-MISSING: plugin "${theme.folder}" declares styles file "${declared}", which does not exist`,
        suggestion: `Create ${relative(path.resolve(theme.dir, declared))} or remove it from \`styles\`.`,
    };
}

function plainRootTokens(file: string, line: number): ProjectValidationFinding {
    return {
        severity: 'warning',
        file,
        message: `DS-THEME-ROOT-SPECIFICITY: custom properties on plain \`:root\` at line ${line} — a site \`:root\` override may lose to them`,
        suggestion:
            'Declare plugin tokens under `:where(:root) { … }` (specificity 0) so site overrides always win.',
    };
}

function declaredCustomProperties(css: string): string[] {
    const tokens: string[] = [];
    postcss.parse(css).walkDecls((decl) => {
        if (decl.prop.startsWith('--')) tokens.push(decl.prop);
    });
    return tokens;
}

/** Lines of rules whose selector list includes a bare `:root` and that declare custom properties. */
function plainRootLines(css: string): number[] {
    const lines: number[] = [];
    postcss.parse(css).walkRules((rule) => {
        const hasBareRoot = rule.selectors.some((selector) => selector.trim() === ':root');
        const declaresTokens = rule.nodes.some(
            (node) => node.type === 'decl' && node.prop.startsWith('--'),
        );
        if (hasBareRoot && declaresTokens) lines.push(rule.source?.start?.line ?? 1);
    });
    return lines;
}

function findTemplateTokenUses(pluginDir: string): TokenUse[] {
    return listJayHtmlFiles(pluginDir).flatMap((file) =>
        extractStyleBlocks(fs.readFileSync(file, 'utf-8')).flatMap((block) =>
            tokenUsesInBlock(block.css).map((use) => ({
                ...use,
                file,
                line: block.startLine + use.blockLine - 1,
            })),
        ),
    );
}

function tokenUsesInBlock(css: string) {
    const uses: Array<{ token: string; hasFallback: boolean; blockLine: number }> = [];
    postcss.parse(css).walkDecls((decl) => {
        for (const match of decl.value.matchAll(VAR_REFERENCE)) {
            uses.push({
                token: match[1],
                hasFallback: match[2] === ',',
                blockLine: decl.source?.start?.line ?? 1,
            });
        }
    });
    return uses;
}

function listJayHtmlFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                return entry.name === 'node_modules' ? [] : listJayHtmlFiles(full);
            return entry.name.endsWith('.jay-html') ? [full] : [];
        });
}
