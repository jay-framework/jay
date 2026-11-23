/** Page-level validators skip standalone component files: those inherit their context from the page. */
export function isPageFile(filePath: string): boolean {
    return filePath.includes('/pages/') || filePath.startsWith('src/pages/');
}
