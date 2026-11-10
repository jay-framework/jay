import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';

export const currentCart = makeJayQuery('cart.current')
    .withRequest()
    .withHandler(async (_input: {}, request) => request.cookies.session);

// jay-action: allow-get-request
export const reviewedCart = makeJayQuery('cart.reviewed')
    .withRequest()
    .withHandler(async (_input: {}, request) => request.cookies.session);

export const logout = makeJayAction('auth.logout')
    .withRequest()
    .withHandler(async (_input: {}, request) => request.clearCookie('session'));
