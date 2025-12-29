import {
    makeJayStackComponent,
    makeJayAction,
    makeJayQuery,
    ActionError,
    phaseOutput,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    ProductRatingContract,
    ProductRatingRefs,
    ProductRatingSlowViewState,
    ProductRatingFastViewState,
} from './product-rating.jay-contract';
import { createMemo, createSignal, Props } from '@jay-framework/component';

export interface ProductRatingProps {}

interface RatingCarryForward {
    rating: number;
    totalReviews: number;
}

export const productRating = makeJayStackComponent<ProductRatingContract>()
    .withProps<ProductRatingProps>()
    .withSlowlyRender(async (props) => {
        // In a real app, this would fetch from a database
        const rating = 4.5;
        const totalReviews = 127;

        return phaseOutput<ProductRatingSlowViewState, RatingCarryForward>(
            {},
            {
                rating,
                totalReviews,
            },
        );
    })
    .withFastRender(async (props: ProductRatingProps, carryForward: RatingCarryForward) => {
        const Pipeline = RenderPipeline.for<ProductRatingFastViewState, RatingCarryForward>();

        return Pipeline.ok({}).toPhaseOutput((state) => ({
            viewState: {
                rating: carryForward.rating,
                totalReviews: carryForward.totalReviews,
                userRating: '',
                star1: false,
                star2: false,
                star3: false,
                star4: false,
                star5: false,
            },
            carryForward,
        }));
    })
    .withInteractive(
        (
            props: Props<ProductRatingProps>,
            refs: ProductRatingRefs,
            fastViewState: Signals<ProductRatingFastViewState>,
            carryForward: RatingCarryForward,
        ) => {
            const [userRatingValue, setUserRatingValue] = createSignal(-1);
            const [rating, setRating] = createSignal(carryForward.rating);
            const [totalReviews, setTotalReviews] = createSignal(carryForward.totalReviews);

            const userRating = createMemo(() =>
                userRatingValue() > 0 ? '' + userRatingValue() : '',
            );
            const star1 = createMemo(() => userRatingValue() > 0.5);
            const star2 = createMemo(() => userRatingValue() > 1.5);
            const star3 = createMemo(() => userRatingValue() > 2.5);
            const star4 = createMemo(() => userRatingValue() > 3.5);
            const star5 = createMemo(() => userRatingValue() > 4.5);

            // Star click handlers
            refs.star1.onclick(() => setUserRatingValue(1));
            refs.star2.onclick(() => setUserRatingValue(2));
            refs.star3.onclick(() => setUserRatingValue(3));
            refs.star4.onclick(() => setUserRatingValue(4));
            refs.star5.onclick(() => setUserRatingValue(5));

            refs.submitButton.onclick(() => {
                const rating = userRatingValue();
                // In a real app, this would submit to the server
                console.log(`User submitted rating: ${rating}}`);
                setRating((_) => (_ * totalReviews() + rating) / (totalReviews() + 1));
                setTotalReviews((_) => _ + 1);
            });

            return {
                render: () => ({
                    rating,
                    totalReviews,
                    userRating,
                    star1,
                    star2,
                    star3,
                    star4,
                    star5,
                }),
            };
        },
    );

// ============================================================================
// Plugin Actions
// ============================================================================

// In-memory ratings store (in a real app, this would be database-backed)
interface Rating {
    productId: string;
    userId: string;
    rating: number;
    createdAt: Date;
}

const ratingsStore: Rating[] = [];

/**
 * Submit a rating for a product.
 */
export const submitRating = makeJayAction('productRating.submit')
    .withHandler(async (input: { productId: string; userId: string; rating: number }) => {
        // Validate rating
        if (input.rating < 1 || input.rating > 5) {
            throw new ActionError('INVALID_RATING', 'Rating must be between 1 and 5');
        }

        // Check if user already rated this product
        const existingRating = ratingsStore.find(
            (r) => r.productId === input.productId && r.userId === input.userId,
        );

        if (existingRating) {
            // Update existing rating
            existingRating.rating = input.rating;
            existingRating.createdAt = new Date();
        } else {
            // Add new rating
            ratingsStore.push({
                productId: input.productId,
                userId: input.userId,
                rating: input.rating,
                createdAt: new Date(),
            });
        }

        return {
            success: true,
            message: 'Rating submitted',
        };
    });

/**
 * Get ratings for a product.
 */
export const getRatings = makeJayQuery('productRating.get')
    .withCaching({ maxAge: 60 })
    .withHandler(async (input: { productId: string }) => {
        const productRatings = ratingsStore.filter((r) => r.productId === input.productId);

        if (productRatings.length === 0) {
            return {
                averageRating: 0,
                totalRatings: 0,
            };
        }

        const sum = productRatings.reduce((acc, r) => acc + r.rating, 0);
        const average = sum / productRatings.length;

        return {
            averageRating: Math.round(average * 10) / 10, // Round to 1 decimal
            totalRatings: productRatings.length,
        };
    });
