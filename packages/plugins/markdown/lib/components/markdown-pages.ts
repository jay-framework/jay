import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { parseMarkdown } from '../parse-markdown.js';
import { frontmatterToHeadTags } from '../head-tags.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface MarkdownPagesProps {
    contentDir: string;
    slug: string;
}

export const markdownPages = makeJayStackComponent()
    .withProps<MarkdownPagesProps>()
    .withLoadParams(async function* (_services: [], props?: Record<string, string>) {
        const dir = props?.contentDir;
        if (!dir) return;
        try {
            const files = await fs.readdir(dir);
            const slugs = files
                .filter((f) => f.endsWith('.md'))
                .map((f) => ({ slug: f.replace(/\.md$/, '') }));
            yield slugs;
        } catch {
            yield [];
        }
    })
    .withSlowlyRender(async (props: MarkdownPagesProps) => {
        const filePath = path.join(props.contentDir, `${props.slug}.md`);
        const content = await fs.readFile(filePath, 'utf-8');
        const { frontmatter, html } = parseMarkdown(content);

        const tags = Array.isArray(frontmatter.tags)
            ? frontmatter.tags.map((name: string) => ({ name: String(name) }))
            : [];

        return phaseOutput(
            {
                title: frontmatter.title ?? '',
                content: html,
                description: frontmatter.description ?? '',
                date: frontmatter.date ? new Date(frontmatter.date).toISOString() : '',
                tags,
                frontmatter: JSON.stringify(frontmatter),
            },
            {},
            { headTags: frontmatterToHeadTags(frontmatter) },
        );
    });
