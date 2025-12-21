import 'dotenv/config';

export default {
  expo: {
    name: "NutriSnap",
    slug: "nutrisnap",
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
      [
        "expo-camera",
        {
          cameraPermission: "NutriSnap needs camera access to photograph your food and scan barcodes."
        }
      ]
    ],
    extra: {
      anthKey: process.env.ANTH_KEY,
    },
  },
};
