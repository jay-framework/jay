/**
 * Mood Tracker Plugin Actions
 *
 * Demonstrates how an NPM package plugin can define server actions
 * that are automatically registered and callable from the client.
 */

import { makeJayAction, makeJayQuery, ActionError } from '@jay-framework/fullstack-component';

/**
 * Mood entry to submit
 */
export interface MoodEntry {
    mood: 'happy' | 'neutral' | 'sad';
    note?: string;
    timestamp?: number;
}

/**
 * Mood statistics returned from the server
 */
export interface MoodStats {
    happy: number;
    neutral: number;
    sad: number;
    total: number;
    streak: number;
    lastMood?: 'happy' | 'neutral' | 'sad';
}

// In-memory storage for demo purposes
// In a real plugin, this would use a service or database
const moodHistory: MoodEntry[] = [];

/**
 * Submit a mood entry to the server.
 *
 * This is a mutation action (POST by default) that records
 * the user's current mood.
 *
 * @example
 * ```typescript
 * import { submitMood } from 'example-jay-mood-tracker-plugin';
 *
 * refs.happyButton.onclick(async () => {
 *     const result = await submitMood({ mood: 'happy', note: 'Great day!' });
 *     console.log(`Recorded mood #${result.entryId}`);
 * });
 * ```
 */
export const submitMood = makeJayAction('moodTracker.submitMood').withHandler(
    async (input: MoodEntry) => {
        // Validate input
        if (!['happy', 'neutral', 'sad'].includes(input.mood)) {
            throw new ActionError('INVALID_MOOD', `Invalid mood: ${input.mood}. Must be happy, neutral, or sad.`);
        }

        // Record the mood entry
        const entry: MoodEntry = {
            mood: input.mood,
            note: input.note,
            timestamp: input.timestamp ?? Date.now(),
        };
        moodHistory.push(entry);

        console.log(`[MoodTracker] Recorded mood: ${input.mood}`);

        return {
            success: true,
            entryId: moodHistory.length,
            totalEntries: moodHistory.length,
        };
    },
);

/**
 * Get mood statistics from the server.
 *
 * This is a query action (GET by default) that returns
 * aggregated mood statistics with caching enabled.
 *
 * @example
 * ```typescript
 * import { getMoodStats } from 'example-jay-mood-tracker-plugin';
 *
 * const stats = await getMoodStats({});
 * console.log(`Happy: ${stats.happy}, Sad: ${stats.sad}, Neutral: ${stats.neutral}`);
 * ```
 */
export const getMoodStats = makeJayQuery('moodTracker.getMoodStats')
    .withCaching({ maxAge: 10, staleWhileRevalidate: 30 })
    .withHandler(async (_input: {}) => {
        // Calculate statistics from history
        const stats: MoodStats = {
            happy: moodHistory.filter((e) => e.mood === 'happy').length,
            neutral: moodHistory.filter((e) => e.mood === 'neutral').length,
            sad: moodHistory.filter((e) => e.mood === 'sad').length,
            total: moodHistory.length,
            streak: calculateStreak(),
            lastMood: moodHistory.length > 0 ? moodHistory[moodHistory.length - 1].mood : undefined,
        };

        return stats;
    });

/**
 * Clear all mood history (for testing/demo).
 */
export const clearMoodHistory = makeJayAction('moodTracker.clearHistory')
    .withMethod('DELETE')
    .withHandler(async (_input: {}) => {
        const count = moodHistory.length;
        moodHistory.length = 0;
        return { cleared: count };
    });

/**
 * Calculate the current streak of same moods.
 */
function calculateStreak(): number {
    if (moodHistory.length === 0) return 0;

    let streak = 1;
    const lastMood = moodHistory[moodHistory.length - 1].mood;

    for (let i = moodHistory.length - 2; i >= 0; i--) {
        if (moodHistory[i].mood === lastMood) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

