import { Capacitor } from '@capacitor/core';

/**
 * Sign in with Apple is offered only in the iPhone and iPad app. (Apple requires it whenever an app offers another company's
 * sign-in, such as Google's. Android and the website do not need it.) Browser tests turn it on with VITE_FAKE_APPLE.
 */
export const appleSignInSupported = (): boolean => import.meta.env.VITE_FAKE_APPLE === 'true' || Capacitor.getPlatform() === 'ios';
