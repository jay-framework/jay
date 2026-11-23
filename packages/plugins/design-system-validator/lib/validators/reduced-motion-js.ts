import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ProjectValidatorFn, ProjectValidationFinding } from '@jay-framework/compiler-shared';

/**
 * DL#238 — JS motion that ignores prefers-reduced-motion (`behavior: 'smooth'`, `element.animate(`).
 * File-level: a file that mentions `prefers-reduced-motion` passes, so the fix and the escape hatch are
 * the same thing. Not suppressible by key.
 */

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs)$/;
const EXCLUDED =
    /(\.d\.ts$|\.test\.|\.spec\.|(^|\/)(test|__tests__|node_modules|dist)\/)/;

const TRIGGERS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /behavior:\s*['"]smooth['"]/, label: "behavior: 'smooth'" },
    { pattern: /\.animate\(/, label: '.animate(' },
];

const SUGGESTION =
    "Check window.matchMedia('(prefers-reduced-motion: reduce)').matches and use behavior: 'instant' / skip the animation when it is true. See design-system-validator agent-kit/designer/reduced-motion.md.";

export const validateReducedMotionJs: ProjectValidatorFn = ({ projectRoot }) => {
    const srcDir = join(projectRoot, 'src');
    if (!existsSync(srcDir)) return [];
    return listSourceFiles(srcDir)
        .map((relative) => checkFile(`src/${relative}`, readFileSync(join(srcDir, relative), 'utf-8')))
        .filter((finding): finding is ProjectValidationFinding => finding != null);
};

function listSourceFiles(srcDir: string): string[] {
    return (readdirSync(srcDir, { recursive: true }) as string[])
        .map((file) => file.split('\\').join('/'))
        .filter((file) => SOURCE_FILE.test(file) && !EXCLUDED.test(file))
        .sort();
}

function checkFile(file: string, text: string): ProjectValidationFinding | undefined {
    if (text.includes('prefers-reduced-motion')) return undefined;
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
        const trigger = TRIGGERS.find(({ pattern }) => pattern.test(lines[index]));
        if (!trigger) continue;
        return {
            severity: 'warning',
            file,
            message: `[reduced-motion/js-motion] line ${index + 1}: ${trigger.label} runs motion without checking prefers-reduced-motion`,
            suggestion: SUGGESTION,
        };
    }
    return undefined;
}
