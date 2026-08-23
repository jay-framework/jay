import * as fs from 'node:fs';
import * as path from 'node:path';

/** Discover DESIGN.md files at project root and under src/pages/. */
export function findAllDesignMdFiles(projectRoot: string): string[] {
    const pagesRoot = path.join(projectRoot, 'src', 'pages');
    const files: string[] = [];

    const rootDesignMd = path.join(projectRoot, 'DESIGN.md');
    if (fs.existsSync(rootDesignMd)) files.push(rootDesignMd);

    if (fs.existsSync(pagesRoot)) {
        walkDesignMdDir(pagesRoot, files);
    }

    return files;
}

function walkDesignMdDir(dir: string, files: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name === 'DESIGN.md') {
            files.push(path.join(dir, entry.name));
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            walkDesignMdDir(path.join(dir, entry.name), files);
        }
    }
}
