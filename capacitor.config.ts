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
    // When the keyboard opens, the whole web view gets shorter (as on Android), so the pinned bar above the keyboard stays in view
    // however far the page is scrolled, and the page is never left half behind the keyboard.
    Keyboard: {
      resize: 'native',
    },
    // Google (and, on iPhone and iPad, Apple) sign-in is done by the phone; Firebase sign-in itself stays with the web library (see src/features/sharing/firebaseAuthNative.ts).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
  },
  // iOS packages (Swift Package Manager): keep the Google sign-in library and leave out the Facebook one, which this app never uses;
  // and link the Firebase plugin by symlink to avoid a package-name clash (see the plugin's README).
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: '6.1',
        packageTraits: { '@capacitor-firebase/authentication': ['Google'] },
        packageOptions: { '@capacitor-firebase/authentication': { symlink: true } },
      },
    },
  },
};

export default config;
