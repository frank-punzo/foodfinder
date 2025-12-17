# Assets Folder

This folder should contain the following image assets:

## Required Assets

### icon.png
- Size: 1024x1024 pixels
- Format: PNG
- Purpose: App icon (will be resized automatically for different platforms)
- Recommendation: Use a simple, recognizable design with the app logo

### splash.png  
- Size: 1284x2778 pixels (or similar aspect ratio)
- Format: PNG
- Purpose: Splash screen shown when app loads
- Background color set in app.json: #1a1a2e

### adaptive-icon.png (Android only)
- Size: 1024x1024 pixels
- Format: PNG with transparency
- Purpose: Android adaptive icon foreground layer
- Note: Design should have padding since Android masks adaptive icons

### favicon.png (Web only)
- Size: 48x48 pixels
- Format: PNG
- Purpose: Browser favicon for web version

## Creating Your Own Icons

You can use tools like:
- [Figma](https://figma.com) - Free design tool
- [Canva](https://canva.com) - Easy-to-use design platform
- [App Icon Generator](https://appicon.co) - Generate all sizes automatically

## Suggested Design

For NutriSnap, consider a design featuring:
- A camera or plate icon
- Gradient colors matching the app (#FF6B6B to #FF8E53)
- Modern, minimal style
- Dark background to match the app theme

## Placeholder Note

For development, you can use solid color PNGs. Expo will still run
without proper icons, but they're required for app store submission.
