/**
 * Smoke tests for fake-shop example.
 *
 * These tests verify that the dev server starts correctly and pages render
 * without Symbol identity issues (services are properly registered and resolved).
 *
 * Run with: yarn test:smoke
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Timeout for dev server to start (ms)
const SERVER_STARTUP_TIMEOUT = 30000;
// Timeout for individual page requests (ms)
const REQUEST_TIMEOUT = 10000;

describe('Fake Shop Smoke Tests', () => {
    let devServerProcess: ChildProcess | null = null;
    let serverReady = false;
    let devServerUrl = '';

    /**
     * Start the dev server before all tests
     */
    beforeAll(async () => {
        await startDevServer();
    }, SERVER_STARTUP_TIMEOUT + 5000);

    /**
     * Stop the dev server after all tests
     */
    afterAll(async () => {
        await stopDevServer();
    });

    /**
     * Start the dev server and wait for it to be ready
     */
    async function startDevServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Dev server did not start within ${SERVER_STARTUP_TIMEOUT}ms`));
            }, SERVER_STARTUP_TIMEOUT);

            devServerProcess = spawn('yarn', ['dev'], {
                cwd: PROJECT_ROOT,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, FORCE_COLOR: '0' },
            });

            let output = '';

            devServerProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                output += text;
                
                // Parse the dev server URL from output (e.g., "📱 Dev Server: http://localhost:3010")
                const urlMatch = text.match(/Dev Server: (http:\/\/localhost:\d+)/);
                if (urlMatch) {
                    devServerUrl = urlMatch[1];
                }
                
                // Look for the success message
                if (text.includes('Jay Stack dev server started successfully')) {
                    clearTimeout(timeout);
                    serverReady = true;
                    // Give it a moment to fully initialize
                    setTimeout(() => resolve(), 1000);
                }
            });

            devServerProcess.stderr?.on('data', (data) => {
                const text = data.toString();
                output += text;
                // Check for service not found errors (Symbol identity issue)
                if (text.includes("Service") && text.includes("not found")) {
                    clearTimeout(timeout);
                    reject(new Error(`Symbol identity issue detected:\n${text}`));
                }
            });

            devServerProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start dev server: ${err.message}`));
            });

            devServerProcess.on('exit', (code) => {
                if (!serverReady && code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Dev server exited with code ${code}\n${output}`));
                }
            });
        });
    }

    /**
     * Stop the dev server
     */
    async function stopDevServer(): Promise<void> {
        if (devServerProcess) {
            devServerProcess.kill('SIGTERM');
            // Wait a bit for cleanup
            await new Promise((resolve) => setTimeout(resolve, 1000));
            devServerProcess = null;
        }
    }

    /**
     * Make a request to the dev server
     */
    async function fetchPage(pagePath: string): Promise<{ status: number; body: string }> {
        if (!devServerUrl) {
            throw new Error('Dev server URL not detected');
        }
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(`${devServerUrl}${pagePath}`, {
                signal: controller.signal,
            });
            const body = await response.text();
            return { status: response.status, body };
        } finally {
            clearTimeout(timeout);
        }
    }

    // =========================================================================
    // Tests
    // =========================================================================

    it('should start dev server without Symbol identity errors', () => {
        // If we got here, the server started successfully
        expect(serverReady).toBe(true);
    });

    it('should render home page successfully', async () => {
        const { status, body } = await fetchPage('/');

        expect(status).toBe(200);
        expect(body).toContain('<!doctype html>');
        expect(body).not.toContain('client error');
        expect(body).not.toContain('server error');
    });

    it('should render products list page successfully', async () => {
        const { status, body } = await fetchPage('/products/');

        expect(status).toBe(200);
        expect(body).toContain('<!doctype html>');
        expect(body).not.toContain('client error');
        expect(body).not.toContain('server error');
    });

    it('should render product detail page successfully', async () => {
        // Use a known product slug
        const { status, body } = await fetchPage('/products/wireless-headphones/');

        expect(status).toBe(200);
        expect(body).toContain('<!doctype html>');
        expect(body).not.toContain('client error');
        expect(body).not.toContain('server error');
    });

    it('should render cart page successfully', async () => {
        const { status, body } = await fetchPage('/cart/');

        expect(status).toBe(200);
        expect(body).toContain('<!doctype html>');
        expect(body).not.toContain('client error');
        expect(body).not.toContain('server error');
    });

    it('should render checkout page successfully', async () => {
        const { status, body } = await fetchPage('/checkout/');

        expect(status).toBe(200);
        expect(body).toContain('<!doctype html>');
        expect(body).not.toContain('client error');
        expect(body).not.toContain('server error');
    });
});
