import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createEditorHandlers } from '../lib/editor-handlers';
import type { JayConfig } from '../lib/config';

describe('Editor Handlers', () => {
    const testConfig: JayConfig = {
        devServer: {
            pagesBase: './test-pages',
            publicFolder: './test-public',
        },
    };

    const testPagesDir = path.resolve('./test-pages');
    const testPublicDir = path.resolve('./test-public');

    beforeEach(() => {
        // Clean up test directories
        if (fs.existsSync(testPagesDir)) {
            fs.rmSync(testPagesDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testPublicDir)) {
            fs.rmSync(testPublicDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        // Clean up test directories
        if (fs.existsSync(testPagesDir)) {
            fs.rmSync(testPagesDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testPublicDir)) {
            fs.rmSync(testPublicDir, { recursive: true, force: true });
        }
    });

    it('should publish pages correctly', async () => {
        const handlers = createEditorHandlers(testConfig);

        const result = await handlers.onPublish({
            type: 'publish',
            pages: [
                {
                    route: '/',
                    jayHtml: '<div>Home Page</div>',
                    name: 'Home',
                },
                {
                    route: '/about',
                    jayHtml: '<div>About Page</div>',
                    name: 'About',
                },
            ],
        });

        expect(result.success).toBe(true);
        expect(result.status).toHaveLength(2);
        expect(result.status[0].success).toBe(true);
        expect(result.status[1].success).toBe(true);

        // Check that files were created
        const homeFile = path.join(testPagesDir, 'page.jay-html');
        const aboutFile = path.join(testPagesDir, 'about', 'page.jay-html');

        expect(fs.existsSync(homeFile)).toBe(true);
        expect(fs.existsSync(aboutFile)).toBe(true);
        expect(fs.readFileSync(homeFile, 'utf-8')).toBe('<div>Home Page</div>');
        expect(fs.readFileSync(aboutFile, 'utf-8')).toBe('<div>About Page</div>');
    });

    it('should save images correctly', async () => {
        const handlers = createEditorHandlers(testConfig);

        const imageData = Buffer.from('fake-image-data').toString('base64');
        const result = await handlers.onSaveImage({
            type: 'saveImage',
            imageId: 'test-image',
            imageData,
        });

        expect(result.success).toBe(true);
        expect(result.imageUrl).toBe('/images/test-image.png');

        // Check that image was saved
        const imagePath = path.join(testPublicDir, 'images', 'test-image.png');
        expect(fs.existsSync(imagePath)).toBe(true);
    });

    it('should check image existence correctly', async () => {
        const handlers = createEditorHandlers(testConfig);

        // Create test image
        const imagesDir = path.join(testPublicDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });
        fs.writeFileSync(path.join(imagesDir, 'test-image.png'), 'fake-data');

        const result = await handlers.onHasImage({
            type: 'hasImage',
            imageId: 'test-image',
        });

        expect(result.success).toBe(true);
        expect(result.exists).toBe(true);
        expect(result.imageUrl).toBe('/images/test-image.png');

        // Check non-existent image
        const result2 = await handlers.onHasImage({
            type: 'hasImage',
            imageId: 'non-existent',
        });

        expect(result2.success).toBe(true);
        expect(result2.exists).toBe(false);
        expect(result2.imageUrl).toBeUndefined();
    });
});
