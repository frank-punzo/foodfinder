import 'dotenv/config';

export default {
  expo: {
    owner: "visioncomp-llc",
    name: "SnapPlate",
    slug: "food-finder",
    version: "2.0.3",
    scheme: "snapplate",
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
      bundleIdentifier: "com.snapplate.app",
      buildNumber: "1"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a1a2e"
      },
      package: "com.snapplate.app",
      versionCode: 6,  // ← REQUIRED: Increment this for each Google Play upload
      permissions: [
        "android.permission.CAMERA",
        "android.permission.INTERNET",
        "android.permission.VIBRATE"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "SnapPlate needs camera access to analyze your food photos and scan barcodes."
        }
      ],
      [
        "react-native-health-connect",
        {
          requestPermissionsRationale: "SnapPlate needs access to Health Connect to track your calories burned and sync with your fitness data."
        }
      ]
    ],
    extra: {
      anthKey: process.env.ANTH_KEY,
      fatSecretClientId: process.env.FATSECRET_CLIENT_ID,
      fatSecretClientSecret: process.env.FATSECRET_CLIENT_SECRET,
      eas: {
        projectId: "ff59a2be-c616-4154-8201-dbe27a1dd9f9"
      }
    },
  },
};