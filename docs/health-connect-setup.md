# Setting Up Google Health Connect with SnapPlate

This guide walks you through setting up Google Health Connect to sync your calories burned data with SnapPlate.

## What is Health Connect?

Google Health Connect is a platform that allows health and fitness apps to share data with each other on your Android device. SnapPlate uses Health Connect to read your calories burned data from fitness apps like Google Fit, Samsung Health, Fitbit, and others.

---

## Step 1: Install Google Health Connect

1. Open the **Google Play Store** on your Android device
2. Search for **"Health Connect by Android"**
3. Tap **Install**
4. Wait for the installation to complete

> **Note:** Health Connect requires Android 8.0 (Oreo) or later. On Android 14+, Health Connect is built into the system settings.

---

## Step 2: Install a Fitness App (if you don't have one)

Health Connect needs a source app to provide calorie data. If you don't already have a fitness app, we recommend **Google Fit**:

1. Open the **Google Play Store**
2. Search for **"Google Fit"**
3. Tap **Install**
4. Open Google Fit and complete the initial setup:
   - Sign in with your Google account
   - Enter your basic profile information (height, weight, etc.)
   - Grant the requested permissions

---

## Step 3: Configure Your Fitness App to Write to Health Connect

Your fitness app needs permission to write calorie data to Health Connect. Here's how to set it up for Google Fit:

### For Google Fit:

1. Open the **Google Fit** app
2. Tap your **Profile** icon (bottom right)
3. Tap the **Settings gear** icon (top right)
4. Scroll down and tap **Manage connected apps**
5. Find **Health Connect** and tap it
6. Enable the following permissions:
   - **Total calories burned** - Toggle ON for both Read and Write
   - **Active calories burned** - Toggle ON for both Read and Write
7. Tap **Save** or **Done**

### For Samsung Health:

1. Open **Samsung Health**
2. Go to **Settings** > **Connected services**
3. Find **Health Connect** and tap it
4. Enable permissions for calories data

### For Fitbit:

1. Open the **Fitbit** app
2. Go to **Account** > **Health Connect**
3. Follow the prompts to enable data sharing

---

## Step 4: Verify Health Connect Has Data

Before connecting SnapPlate, verify that Health Connect is receiving data:

1. Open **Health Connect** (search for it in your app drawer)
2. Tap **Data and access**
3. Tap **Browse data**
4. Look for **Total calories burned** or **Active calories burned**
5. Verify you see recent entries from your fitness app

> **Tip:** If you don't see any data, open your fitness app and let it sync. You may need to record an activity or wait for the app to update.

---

## Step 5: Connect SnapPlate to Health Connect

1. Open **SnapPlate**
2. Go to **Profile** tab
3. Scroll down to **Health Integrations**
4. Tap **Connect** next to **Google Health Connect**
5. A permission dialog will appear - tap **Allow** for:
   - Read Total calories burned
   - Read Active calories burned
6. You should see a "Connected!" confirmation

---

## Step 6: View Your Consumption vs. Burned Report

1. In SnapPlate, go to **Profile** tab
2. Tap **View Reports**
3. Tap **Consumption vs. Burned**
4. Select your desired date range (7, 14, 30, 60, or 90 days)
5. You'll see a chart comparing:
   - **Red bars**: Calories consumed (from your food logs)
   - **Green bars**: Calories burned (from Health Connect)

---

## Troubleshooting

### "Health Connect not available" error

- Ensure Health Connect is installed from the Play Store
- Restart your phone after installing Health Connect
- Check that your Android version is 8.0 or later

### "Permission Denied" error

1. Open your device **Settings**
2. Go to **Apps** > **Health Connect** (or search for "Health Connect")
3. Tap **Permissions**
4. Ensure SnapPlate has access to health data
5. Return to SnapPlate and try connecting again

### No calories burned data showing

1. **Check your fitness app is syncing:**
   - Open Google Fit (or your fitness app)
   - Ensure it shows recent activity data

2. **Verify Health Connect permissions:**
   - Open Health Connect
   - Tap **App permissions**
   - Find Google Fit and ensure "Total calories burned" is enabled
   - Find SnapPlate and ensure read access is granted

3. **Check the date range:**
   - Health Connect only has data for dates when your fitness app was active
   - Try selecting a shorter date range that includes recent activity

### Data seems incorrect or missing days

- Health Connect only reports data for times when your fitness app was actively tracking
- If you didn't wear your fitness tracker or open your fitness app, there may be gaps
- Some apps only sync once per day, so recent data may not appear immediately

---

## Supported Fitness Apps

SnapPlate can read calories burned data from any app that writes to Health Connect, including:

- Google Fit
- Samsung Health
- Fitbit
- Garmin Connect
- Strava
- MyFitnessPal
- Peloton
- Oura
- Whoop
- And many more...

---

## Privacy & Data

- SnapPlate only reads calorie data from Health Connect - it never writes data
- Your health data stays on your device and is synced to your SnapPlate account
- You can disconnect Health Connect at any time from the Profile screen
- Disconnecting removes SnapPlate's access but does not delete historical data

---

## Need Help?

If you're still having trouble connecting Health Connect, please contact support with:
- Your Android version (Settings > About phone)
- Your fitness app name and version
- Screenshots of any error messages
