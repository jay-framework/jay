/**
 * Consolidated initialization for the mood-tracker plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file. The compiler automatically
 * splits this into server and client bundles.
 */

import { makeJayInit, createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';

// ============================================================================
// Type Definitions (shared between server and client)
// ============================================================================

/**
 * Configuration passed from server to client for the mood tracker.
 */
export interface MoodTrackerConfig {
    /** Whether analytics tracking is enabled */
    analyticsEnabled: boolean;
    /** Endpoint for tracking requests */
    trackingEndpoint: string;
}

/**
 * Server-side analytics configuration (not sent to client).
 */
export interface MoodAnalyticsConfig {
    enabled: boolean;
    trackingEndpoint: string;
    retentionDays: number;
}

// ============================================================================
// Service Definition (server-only)
// ============================================================================

export interface MoodAnalyticsService {
    /** Whether analytics tracking is enabled */
    enabled: boolean;
    /** Track a mood event */
    trackMood(userId: string, mood: string): void;
    /** Get analytics config */
    getConfig(): MoodAnalyticsConfig;
}

export const MOOD_ANALYTICS_SERVICE =
    createJayService<MoodAnalyticsService>('MoodAnalyticsService');

// ============================================================================
// Context Definition (client-only)
// ============================================================================

/**
 * Global context for mood tracker configuration.
 * Components can access this via useContext(MOOD_TRACKER_CONFIG_CONTEXT).
 */
export const MOOD_TRACKER_CONFIG_CONTEXT = createJayContext<MoodTrackerConfig>();

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[mood-tracker-plugin] Initializing server-side services...');

        // Plugin configuration - in a real app, this might come from environment variables
        const config: MoodAnalyticsConfig = {
            enabled: process.env.MOOD_ANALYTICS_ENABLED !== 'false',
            trackingEndpoint: process.env.MOOD_ANALYTICS_ENDPOINT || '/api/mood-analytics',
            retentionDays: parseInt(process.env.MOOD_RETENTION_DAYS || '30', 10),
        };

        // Create and register the analytics service
        const analyticsService: MoodAnalyticsService = {
            enabled: config.enabled,
            trackMood(userId: string, mood: string) {
                if (config.enabled) {
                    console.log(`[MoodAnalytics] User ${userId} recorded mood: ${mood}`);
                }
            },
            getConfig() {
                return config;
            },
        };

        registerService(MOOD_ANALYTICS_SERVICE, analyticsService);

        console.log('[mood-tracker-plugin] Server initialization complete');

        // Return data to pass to client (typed!)
        return {
            analyticsEnabled: config.enabled,
            trackingEndpoint: config.trackingEndpoint,
            // Note: We don't send retentionDays - that's server-only config
        };
    })
    .withClient((data) => {
        // data is typed as the return type of withServer!
        console.log('[mood-tracker-plugin] Initializing client-side context...');
        console.log('[mood-tracker-plugin] Received config from server:', data);

        registerGlobalContext(MOOD_TRACKER_CONFIG_CONTEXT, data);

        console.log('[mood-tracker-plugin] Client initialization complete');
    });
