# 🍽️ SnapPlate - AI-Powered Food Calorie & Macro Tracker

A beautiful cross-platform mobile application that uses AI to analyze photos of your food and provide detailed nutritional information including calories and macronutrients.

![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue)
![Framework](https://img.shields.io/badge/Framework-React%20Native%20%2B%20Expo-purple)
![AI](https://img.shields.io/badge/AI-Claude%20Vision-orange)

## ✨ Features

- **📸 Camera Integration**: Take photos directly within the app
- **🤖 AI Food Recognition**: Automatically identifies food items on your plate
- **🔥 Calorie Estimation**: Get approximate calorie counts for each item
- **💪 Macro Breakdown**: View protein, carbohydrates, and fat content
- **📊 Summary Dashboard**: Beautiful visual summary of your meal's nutrition
- **🌙 Dark Mode UI**: Modern, eye-friendly dark interface
- **📱 Cross-Platform**: Works on both iOS and Android

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v18 or later)
2. **npm** or **yarn**
3. **Expo CLI**
4. **Expo Go app** on your mobile device (for testing)

### Installation

1. **Clone or download the project**
   ```bash
   cd food-calorie-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server**
   ```bash
   npx expo start
   ```

4. **Run on your device**
   - Scan the QR code with Expo Go (Android) or Camera app (iOS)
   - Or press `a` for Android emulator / `i` for iOS simulator

## 📱 How to Use

1. **Launch the app** - Grant camera permissions when prompted
2. **Point at your food** - Position your plate within the frame guides
3. **Tap the capture button** - Take a photo of your meal
4. **Wait for analysis** - AI analyzes the image (usually 3-5 seconds)
5. **View results** - See detailed nutritional breakdown including:
   - Individual food items detected
   - Calories per item
   - Protein, carbs, and fat per item
   - Total meal summary

## 🏗️ Project Structure

```
food-calorie-tracker/
├── App.js              # Main application component
├── app.json            # Expo configuration
├── package.json        # Dependencies and scripts
├── babel.config.js     # Babel configuration
├── assets/             # App icons and splash screens
│   ├── icon.png
│   ├── splash.png
│   ├── adaptive-icon.png
│   └── favicon.png
└── README.md           # This file
```

## 🔧 Configuration

### API Configuration

The app uses Claude's Vision API for food analysis. The API is called directly from the app. For production use, you should:

1. **Set up a backend server** to handle API calls securely
2. **Store your API key** on the server, not in the client app
3. **Add rate limiting** to prevent abuse

### Customizing the App

- **Colors**: Modify the gradient colors in `styles` and `LinearGradient` components
- **Animations**: Adjust animation timings in the `Animated` configurations
- **UI Text**: Update labels and messages throughout `App.js`

## 📦 Building for Production

### iOS

```bash
# Build for iOS
npx expo build:ios

# Or use EAS Build
npx eas build --platform ios
```

### Android

```bash
# Build for Android
npx expo build:android

# Or use EAS Build
npx eas build --platform android
```

## 🛠️ Technologies Used

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform and tools
- **expo-camera** - Camera functionality
- **expo-image-manipulator** - Image processing
- **expo-linear-gradient** - Beautiful gradient backgrounds
- **expo-blur** - iOS-style blur effects
- **Claude Vision API** - AI-powered food recognition

## ⚠️ Disclaimer

**Nutritional values are estimates** based on visual analysis. Actual nutritional content may vary depending on:
- Exact ingredients used
- Cooking methods
- Portion sizes
- Hidden ingredients

For precise nutritional tracking, consult food packaging labels or a registered dietitian.

## 🐛 Troubleshooting

### Camera not working
- Ensure camera permissions are granted in device settings
- Try restarting the app

### Analysis fails
- Check your internet connection
- Ensure the image is clear and well-lit
- Make sure food is visible in the frame

### App crashes on startup
- Clear the Expo cache: `npx expo start --clear`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## 📄 License

MIT License - feel free to use and modify for your own projects!

## 🙏 Acknowledgments

- Built with [Expo](https://expo.dev/)
- AI powered by [Claude](https://www.anthropic.com/)
- Icons and design inspired by modern health & fitness apps

---

**Made with ❤️ for healthier eating habits**
