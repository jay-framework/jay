import fs from 'fs';
import path from 'path';
import type { ProjectValidationFinding, ProjectValidatorFn } from '@jay-framework/compiler-shared';
import { checkArdFiles } from '../validate-ard.js';
import { readJayConfig } from '../read-jay-config.js';

/**
 * Project-level SEO/discovery checks (DL#232, moved out of core `validate.ts`): robots.txt presence,
 * site.baseUrl / site.name (DL#175/#213), and ARD presence + shape (DL#214). Decision C: the context
 * is only `{ projectRoot }`, so `.jay` config is read here, not passed in.
 */
export const validateProject: ProjectValidatorFn = async (ctx) => {
    const { projectRoot } = ctx;
    const findings: ProjectValidationFinding[] = [];

    if (!fs.existsSync(path.resolve(projectRoot, 'public/robots.txt'))) {
        findings.push({
            severity: 'warning',
            file: 'public/robots.txt',
            message:
                "public/robots.txt not found — search engines may crawl pages you don't intend to expose.",
            suggestion:
                'Create public/robots.txt with: User-agent: *\nAllow: /\nSitemap: https://your-domain.com/sitemap.xml',
        });
    }

    const config = readJayConfig(projectRoot);

    if (!config.site?.baseUrl) {
        findings.push({
            severity: 'warning',
            file: '.jay',
            message:
                'site.baseUrl not configured — sitemap.xml will not be generated in production.',
            suggestion: 'Add to .jay config:\n  site:\n    baseUrl: https://your-domain.com',
        });
    }

    // DL#213 — site identity drives the auto-emitted Organization/WebSite JSON-LD.
    if (!config.site?.name) {
        findings.push({
            severity: 'warning',
            file: '.jay',
            message:
                'site.name not configured — Organization/WebSite JSON-LD and llms.txt will not be emitted, reducing how well search engines and agents understand the site.',
            suggestion:
                'Add to .jay config:\n  site:\n    name: Your Site Name\n    logo: /logo.png\n    description: What your site is about',
        });
    }

    // DL#214 — agent-discovery: /.well-known/ard.json is author/agent responsibility. Warn on
    // absence; validate the ARD v0.91 shape when present. Suppress the absence nudge via `.jay`
    // `validations: { allow-no-ard: true }`.
    const allowNoArd = config.validations?.['allow-no-ard'] === true;
    const ardResult = await checkArdFiles(projectRoot);
    if (ardResult.absent) {
        if (!allowNoArd) {
            findings.push({
                severity: 'warning',
                file: 'public/.well-known/ard.json',
                message:
                    'public/.well-known/ard.json not found — agents cannot discover this site’s resources/APIs via Agentic Resource Discovery.',
                suggestion:
                    'Author public/.well-known/ard.json (ARD v0.91), or suppress with `validations: { allow-no-ard: true }` in .jay if the site has no agent resources to advertise. See developer/seo-guide.md.',
            });
        }
    } else {
        for (const finding of ardResult.findings) {
            findings.push({
                severity: finding.severity,
                file: 'public/.well-known/ard.json',
                message: finding.message,
                suggestion: finding.suggestion,
            });
        }
    }

    return findings;
};
