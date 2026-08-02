import { makeJayStackComponent, notFound, phaseOutput } from '@jay-framework/fullstack-component';
import { parseMarkdownWithMermaid } from '../parse-markdown.js';
import type { MarkdownImageOptions, MediaMapEntry } from '../parse-markdown.js';
import { frontmatterToHeadTags } from '../head-tags.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface MarkdownPagesProps {
    contentDir: string;
    slug: string;
    mediaMap?: string;
}

function readPublicFolder(): string {
    try {
        const configPath = path.resolve('.jay');
        if (fsSync.existsSync(configPath)) {
            const config = yaml.load(fsSync.readFileSync(configPath, 'utf-8')) as any;
            return config?.devServer?.publicFolder || './public';
        }
    } catch {}
    return './public';
}

const MEDIA_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.avif',
    '.ico',
    '.mp4',
    '.webm',
    '.ogg',
    '.mp3',
    '.wav',
    '.pdf',
]);

async function copyMediaToPublic(contentDir: string, publicFolder: string): Promise<string> {
    const publicSubDir = path.join(publicFolder, contentDir);
    await fs.mkdir(publicSubDir, { recursive: true });

    try {
        const files = await fs.readdir(contentDir);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (!MEDIA_EXTENSIONS.has(ext)) continue;
            const src = path.join(contentDir, file);
            const dest = path.join(publicSubDir, file);
            try {
                const srcStat = await fs.stat(src);
                let needsCopy = true;
                try {
                    const destStat = await fs.stat(dest);
                    if (destStat.mtimeMs >= srcStat.mtimeMs) needsCopy = false;
                } catch {}
                if (needsCopy) await fs.copyFile(src, dest);
            } catch {}
        }
    } catch {}

    return '/' + contentDir.replace(/\\/g, '/');
}

async function loadMediaMap(mapPath: string): Promise<Record<string, MediaMapEntry>> {
    try {
        const content = await fs.readFile(mapPath, 'utf-8');
        return (yaml.load(content) as Record<string, MediaMapEntry>) || {};
    } catch {
        return {};
    }
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
        let content: string;
        try {
            content = await fs.readFile(filePath, 'utf-8');
        } catch (err: any) {
            if (err?.code === 'ENOENT') return notFound();
            throw err;
        }

        let imageOptions: MarkdownImageOptions = {};

        if (props.mediaMap) {
            const mediaMap = await loadMediaMap(props.mediaMap);
            const publicFolder = readPublicFolder();
            const imageBaseUrl = await copyMediaToPublic(props.contentDir, publicFolder);
            imageOptions = { mediaMap, imageBaseUrl };
        } else {
            const publicFolder = readPublicFolder();
            const imageBaseUrl = await copyMediaToPublic(props.contentDir, publicFolder);
            imageOptions = { imageBaseUrl };
        }

        const { frontmatter, html } = await parseMarkdownWithMermaid(content, imageOptions);

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
