/**
 * Consolidated initialization for the product-rating plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 */

import { makeJayInit, createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';

// ============================================================================
// Type Definitions (shared between server and client)
// ============================================================================

/**
 * Configuration passed from server to client for the rating UI.
 */
export interface ProductRatingConfig {
    /** Maximum number of stars */
    maxStars: number;
    /** Whether to allow half-star ratings */
    allowHalfStars: boolean;
    /** Whether to show the review count */
    showReviewCount: boolean;
    /** Whether rating submission is enabled */
    enableRatingSubmission: boolean;
}

// ============================================================================
// Service Definition (server-only)
// ============================================================================

export interface RatingsService {
    /** Get average rating for a product */
    getAverageRating(productId: string): Promise<number>;
    /** Get total number of ratings for a product */
    getTotalRatings(productId: string): Promise<number>;
    /** Submit a rating */
    submitRating(productId: string, userId: string, rating: number): Promise<void>;
}

export const RATINGS_SERVICE = createJayService<RatingsService>('RatingsService');

// In-memory storage (in a real app, this would be a database)
const ratingsDb = new Map<string, { userId: string; rating: number }[]>();

function createRatingsService(): RatingsService {
    return {
        async getAverageRating(productId: string): Promise<number> {
            const ratings = ratingsDb.get(productId) || [];
            if (ratings.length === 0) return 0;
            const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
            return Math.round((sum / ratings.length) * 10) / 10;
        },

        async getTotalRatings(productId: string): Promise<number> {
            return (ratingsDb.get(productId) || []).length;
        },

        async submitRating(productId: string, userId: string, rating: number): Promise<void> {
            if (!ratingsDb.has(productId)) {
                ratingsDb.set(productId, []);
            }
            const ratings = ratingsDb.get(productId)!;

            // Update existing or add new
            const existing = ratings.find((r) => r.userId === userId);
            if (existing) {
                existing.rating = rating;
            } else {
                ratings.push({ userId, rating });
            }
        },
    };
}

// ============================================================================
// Context Definition (client-only)
// ============================================================================

/**
 * Global context for rating UI configuration.
 * Components can access this via useContext(RATING_UI_CONFIG_CONTEXT).
 */
export const RATING_UI_CONFIG_CONTEXT = createJayContext<ProductRatingConfig>();

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[product-rating] Initializing ratings service...');

        // Register the ratings service
        const ratingsService = createRatingsService();
        registerService(RATINGS_SERVICE, ratingsService);

        console.log('[product-rating] Server initialization complete');

        // Return UI configuration to pass to client (typed!)
        return {
            maxStars: 5,
            allowHalfStars: false,
            showReviewCount: true,
            enableRatingSubmission: true,
        };
    })
    .withClient((data) => {
        // data is typed from withServer return!
        console.log('[product-rating] Initializing client-side context...');
        console.log('[product-rating] Received config from server:', data);

        registerGlobalContext(RATING_UI_CONFIG_CONTEXT, data);

        console.log('[product-rating] Client initialization complete');
    });
