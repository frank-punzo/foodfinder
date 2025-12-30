import 'dotenv/config';

export default {
  expo: {
    owner: "visioncomp-llc",
    name: "NutriSnap",
    slug: "food-finder",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a2e"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.nutrisnap.app"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a1a2e"
      },
      package: "com.nutrisnap.app",
      permissions: ["android.permission.CAMERA"]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-camera"
    ],
    extra: {
      anthKey: process.env.ANTH_KEY,
      // FatSecret API Credentials (OAuth 2.0)
      fatSecretClientId: process.env.FATSECRET_CLIENT_ID,
      fatSecretClientSecret: process.env.FATSECRET_CLIENT_SECRET,
      eas: {
        projectId: "ff59a2be-c616-4154-8201-dbe27a1dd9f9"
      }
    },
  },
};
