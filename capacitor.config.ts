import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.simplebiblememory',
  appName: 'Simple Bible Memory',
  webDir: 'dist',
  plugins: {
    // Google sign-in is done by Android; Firebase sign-in itself stays with the web library (see src/features/sharing/firebaseAuthNative.ts).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
