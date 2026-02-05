/**
 * Smoke tests for fake-shop example.
 *
 * These tests verify that the dev server starts correctly and pages render
 * without Symbol identity issues (services are properly registered and resolved).
 *
 * Uses --test-mode for reliable health checks and clean shutdown.
 *
 * Run with: yarn test:smoke
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Timeout for dev server to start (ms)
const SERVER_STARTUP_TIMEOUT = 60000;
// Timeout for individual page requests (ms)
const REQUEST_TIMEOUT = 10000;
// Poll interval for health check (ms)
const HEALTH_POLL_INTERVAL = 500;

describe('Fake Shop Smoke Tests', () => {
    let devServerProcess: ChildProcess | null = null;
    let devServerUrl = '';

    /**
     * Start the dev server before all tests
     */
    beforeAll(async () => {
        devServerUrl = await startDevServer();
    }, SERVER_STARTUP_TIMEOUT + 5000);

    /**
     * Stop the dev server after all tests
     */
    afterAll(async () => {
        await stopDevServer();
    });

    /**
     * Start the dev server with --test-mode and wait for health endpoint
     */
    async function startDevServer(): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Dev server did not start within ${SERVER_STARTUP_TIMEOUT}ms`));
            }, SERVER_STARTUP_TIMEOUT);

            let detectedUrl = '';
            let output = '';

            // Start with --test-mode for health/shutdown endpoints
            devServerProcess = spawn('yarn', ['dev', '--test-mode'], {
                cwd: PROJECT_ROOT,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, FORCE_COLOR: '0' },
            });

            let pollingStarted = false;

            devServerProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                output += text;

                // Parse the dev server URL from output (check accumulated output, not just current chunk)
                const urlMatch = output.match(/Dev Server: (http:\/\/localhost:\d+)/);
                if (urlMatch) {
                    detectedUrl = urlMatch[1];
                }

                // Once we see the success message, start polling health endpoint
                // Check accumulated output to handle line-by-line buffering (e.g., when run via wsrun)
                if (!pollingStarted && output.includes('Jay Stack dev server started successfully') && detectedUrl) {
                    pollingStarted = true;
                    pollHealth(detectedUrl, timeout, resolve, reject);
                }
            });

            devServerProcess.stderr?.on('data', (data) => {
                const text = data.toString();
                output += text;
                // Check for service not found errors (Symbol identity issue)
                if (text.includes('Service') && text.includes('not found')) {
                    clearTimeout(timeout);
                    reject(new Error(`Symbol identity issue detected:\n${text}`));
                }
            });

            devServerProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start dev server: ${err.message}`));
            });

            devServerProcess.on('exit', (code) => {
                if (!detectedUrl && code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Dev server exited with code ${code}\n${output}`));
                }
            });
        });
    }

    /**
     * Poll health endpoint until ready
     */
    async function pollHealth(
        url: string,
        timeout: NodeJS.Timeout,
        resolve: (url: string) => void,
        reject: (err: Error) => void,
    ): Promise<void> {
        const healthUrl = `${url}/_jay/health`;
        const startTime = Date.now();

        const poll = async () => {
            try {
                const response = await fetch(healthUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'ready') {
                        clearTimeout(timeout);
                        resolve(url);
                        return;
                    }
                }
            } catch {
                // Not ready yet, continue polling
            }

            // Check if we've exceeded timeout
            if (Date.now() - startTime > SERVER_STARTUP_TIMEOUT - 1000) {
                clearTimeout(timeout);
                reject(new Error('Health endpoint never became ready'));
                return;
            }

            // Poll again after interval
            setTimeout(poll, HEALTH_POLL_INTERVAL);
        };

        poll();
    }

    /**
     * Stop the dev server via shutdown endpoint
     */
    async function stopDevServer(): Promise<void> {
        if (devServerUrl) {
            try {
                await fetch(`${devServerUrl}/_jay/shutdown`, { method: 'POST' });
                // Wait for graceful shutdown
                await new Promise((resolve) => setTimeout(resolve, 500));
            } catch {
                // Server may have already stopped
            }
        }

        // Fallback: kill process if still running
        if (devServerProcess) {
            devServerProcess.kill('SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 500));
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

    it('should start dev server and respond to health check', async () => {
        // If we got here, the server started successfully
        expect(devServerUrl).toBeTruthy();

        // Verify health endpoint works
        const response = await fetch(`${devServerUrl}/_jay/health`);
        expect(response.ok).toBe(true);

        const health = await response.json();
        expect(health.status).toBe('ready');
        expect(health.port).toBeGreaterThan(0);
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
