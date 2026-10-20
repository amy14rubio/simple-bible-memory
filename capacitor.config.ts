import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.simplebiblememory',
  appName: 'Simple Bible Memory',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      // The little icon on a reminder: a white heart with a cross cut out (android/app/src/main/res/drawable/ic_stat_heart.xml), tinted in the accent colour.
      smallIcon: 'ic_stat_heart',
      iconColor: '#d96878',
    },
    // Google sign-in is done by Android; Firebase sign-in itself stays with the web library (see src/features/sharing/firebaseAuthNative.ts).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
