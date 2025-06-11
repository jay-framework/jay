import { injectHeadLinks, HeadLink } from '../../lib';
import { JSDOM } from 'jsdom';

describe('injectHeadLinks', () => {
    let dom: JSDOM;
    let document: Document;
    let head: HTMLHeadElement;

    beforeEach(() => {
        // Create a fresh DOM for each test
        dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
        document = dom.window.document;
        head = document.head;

        // Set up global document for the function
        global.document = document;
    });

    afterEach(() => {
        // Clean up
        delete (global as any).document;
    });

    it('should inject basic head links', () => {
        const headLinks: HeadLink[] = [
            { rel: 'stylesheet', href: 'styles/main.css' },
            { rel: 'icon', href: '/favicon.ico' },
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(2);

        expect(links[0].rel).toBe('stylesheet');
        expect(links[0].href).toBe('styles/main.css');
        expect(links[0].getAttribute('rel')).toBe('stylesheet');
        expect(links[0].getAttribute('href')).toBe('styles/main.css');

        expect(links[1].rel).toBe('icon');
        expect(links[1].href).toBe('/favicon.ico');
    });

    it('should inject head links with attributes', () => {
        const headLinks: HeadLink[] = [
            {
                rel: 'preconnect',
                href: 'https://fonts.gstatic.com',
                attributes: { crossorigin: '' },
            },
            {
                rel: 'icon',
                href: '/favicon-32x32.png',
                attributes: {
                    type: 'image/png',
                    sizes: '32x32',
                },
            },
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(2);

        // Test preconnect with crossorigin
        expect(links[0].rel).toBe('preconnect');
        expect(links[0].href).toBe('https://fonts.gstatic.com/');
        expect(links[0].getAttribute('crossorigin')).toBe('');

        // Test icon with type and sizes
        expect(links[1].rel).toBe('icon');
        expect(links[1].href).toBe('/favicon-32x32.png');
        expect(links[1].getAttribute('type')).toBe('image/png');
        expect(links[1].getAttribute('sizes')).toBe('32x32');
    });

    it('should handle empty head links array', () => {
        const headLinks: HeadLink[] = [];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(0);
    });

    it('should avoid duplicate links by href', () => {
        // First injection
        const headLinks1: HeadLink[] = [{ rel: 'stylesheet', href: 'styles/main.css' }];
        injectHeadLinks(headLinks1);

        // Second injection with same href
        const headLinks2: HeadLink[] = [
            { rel: 'stylesheet', href: 'styles/main.css' },
            { rel: 'icon', href: '/favicon.ico' },
        ];
        injectHeadLinks(headLinks2);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(2); // Should only have 2 links, not 3

        const stylesheetLinks = head.querySelectorAll('link[href="styles/main.css"]');
        expect(stylesheetLinks).toHaveLength(1); // Only one stylesheet link

        const iconLinks = head.querySelectorAll('link[href="/favicon.ico"]');
        expect(iconLinks).toHaveLength(1); // Icon link should be added
    });

    it('should handle links with different rel but same href', () => {
        const headLinks: HeadLink[] = [
            { rel: 'stylesheet', href: 'styles/main.css' },
            { rel: 'preload', href: 'styles/main.css', attributes: { as: 'style' } },
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(2);

        expect(links[0].rel).toBe('stylesheet');
        expect(links[0].href).toBe('styles/main.css');

        expect(links[1].rel).toBe('preload');
        expect(links[1].href).toBe('styles/main.css');
        expect(links[1].getAttribute('as')).toBe('style');
    });

    it('should handle complex attributes correctly', () => {
        const headLinks: HeadLink[] = [
            {
                rel: 'alternate',
                href: 'https://example.com/es/',
                attributes: {
                    hreflang: 'es',
                    type: 'text/html',
                    title: 'Spanish Version',
                },
            },
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(1);

        const link = links[0];
        expect(link.rel).toBe('alternate');
        expect(link.href).toBe('https://example.com/es/');
        expect(link.getAttribute('hreflang')).toBe('es');
        expect(link.getAttribute('type')).toBe('text/html');
        expect(link.getAttribute('title')).toBe('Spanish Version');
    });

    it('should handle special characters in attributes', () => {
        const headLinks: HeadLink[] = [
            {
                rel: 'alternate',
                href: '/page with spaces.html',
                attributes: {
                    title: 'Page "With" Quotes & Symbols',
                },
            },
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(1);

        const link = links[0];
        expect(link.href).toBe('/page with spaces.html');
        expect(link.getAttribute('title')).toBe('Page "With" Quotes & Symbols');
    });

    it('should do nothing when document.head is null', () => {
        // Mock a document without head
        global.document = {
            head: null,
        } as any;

        const headLinks: HeadLink[] = [{ rel: 'stylesheet', href: 'styles/main.css' }];

        // Should not throw an error
        expect(() => injectHeadLinks(headLinks)).not.toThrow();
    });

    it('should handle missing attributes gracefully', () => {
        const headLinks: HeadLink[] = [
            { rel: 'stylesheet', href: 'styles/main.css' }, // No attributes
            { rel: 'icon', href: '/favicon.ico', attributes: {} }, // Empty attributes
        ];

        injectHeadLinks(headLinks);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(2);

        expect(links[0].rel).toBe('stylesheet');
        expect(links[0].href).toBe('styles/main.css');

        expect(links[1].rel).toBe('icon');
        expect(links[1].href).toBe('/favicon.ico');
    });

    it('should append new links to the end of head', () => {
        // Add some existing elements to head
        const existingMeta = document.createElement('meta');
        existingMeta.setAttribute('charset', 'UTF-8');
        head.appendChild(existingMeta);

        const existingTitle = document.createElement('title');
        existingTitle.textContent = 'Test Page';
        head.appendChild(existingTitle);

        const headLinks: HeadLink[] = [{ rel: 'stylesheet', href: 'styles/main.css' }];

        injectHeadLinks(headLinks);

        expect(head.children).toHaveLength(3);
        expect(head.children[0].tagName).toBe('META');
        expect(head.children[1].tagName).toBe('TITLE');
        expect(head.children[2].tagName).toBe('LINK');
        expect((head.children[2] as HTMLLinkElement).href).toBe('styles/main.css');
    });

    it('should handle multiple calls correctly', () => {
        // First call
        injectHeadLinks([{ rel: 'stylesheet', href: 'styles/main.css' }]);

        // Second call with new links
        injectHeadLinks([
            { rel: 'icon', href: '/favicon.ico' },
            { rel: 'manifest', href: '/manifest.json' },
        ]);

        const links = head.querySelectorAll('link');
        expect(links).toHaveLength(3);

        expect(links[0].href).toBe('styles/main.css');
        expect(links[1].href).toBe('/favicon.ico');
        expect(links[2].href).toBe('/manifest.json');
    });
});
