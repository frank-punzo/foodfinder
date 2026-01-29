// Add these imports after the existing imports
import { LoginScreen, RegisterScreen, ForgotPasswordScreen } from './screens/AuthScreens';
import { 
  isAuthenticated, 
  getMyProfile, 
  logout, 
  getAccessToken,
  storeCustomerId,
  getCustomerId 
} from './services/authService';
import { searchFoods, getFoodDetails, calculateServingNutrition } from './services/fatSecretService';
import {
  HEALTH_PROVIDERS,
  getAvailableProviders,
  initiateOAuth,
  handleOAuthCallback,
  getConnectedProviders,
  disconnectProvider,
  getConsumptionVsBurnedReport,
  setupOAuthDeepLinkListener,
  isOAuthCallback,
} from './services/healthService';
import {
  isLocalHealthAvailable,
  isHealthConnectAvailable,
  isHealthKitAvailable,
  requestLocalHealthPermissions,
  syncLocalHealthToBackend,
  openHealthSettings,
  getLocalWeight,
  getLocalWeightByDate,
} from './services/localHealthService';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Animated,
  Dimensions,
  Vibration,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  Platform,
  Linking,
  KeyboardAvoidingView,
  BackHandler,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================================================
// CONFIGURATION - Update these with your actual values
// =============================================================================
const API_CONFIG = {
  // Your backend API URL for database operations
//  DATABASE_API_URL: 'https://102rxnded9.execute-api.us-east-1.amazonaws.com/dev',
  DATABASE_API_URL: 'https://eljniup0wk.execute-api.us-east-1.amazonaws.com/prod',
  // Customer ID (in a real app, this would come from authentication)
  CUSTOMER_ID: 1,
};

// =============================================================================
// DATE HELPER FUNCTIONS
// =============================================================================

// Get a date in local timezone as YYYY-MM-DD format
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Parse a YYYY-MM-DD string as local date (not UTC)
const parseLocalDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Calculate net carbs (carbs - fiber)
const calculateNetCarbs = (carbs, fiber) => {
  const c = parseFloat(carbs) || 0;
  const f = parseFloat(fiber) || 0;
  return Math.max(0, Math.round((c - f) * 10) / 10);
};

// =============================================================================
// MEAL TYPES
// =============================================================================
const MEAL_TYPES = [
  { id: 1, name: 'Breakfast', icon: '🌅', color: '#FFB347' },
  { id: 2, name: 'Lunch', icon: '☀️', color: '#87CEEB' },
  { id: 3, name: 'Dinner', icon: '🌙', color: '#9B59B6' },
  { id: 4, name: 'Snack', icon: '🍎', color: '#2ECC71' },
];

// =============================================================================
// API SERVICES
// =============================================================================

// Food Analysis Service using Claude API
const analyzeFoodImage = async (base64Image) => {
  try {
    const apiKey = Constants.expoConfig?.extra?.anthKey;
    if (!apiKey) {
      throw new Error('API key not configured. Please check your environment variables.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 3000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `You are an expert nutritionist and food identification specialist. Analyze this food image carefully and provide detailed nutritional information.

INSTRUCTIONS:
1. CAREFULLY examine the entire image and identify ALL visible food items
2. For each item, consider:
   - Visual texture, color, and appearance to distinguish similar foods
   - Size relative to common reference objects (plates, utensils, hands)
   - Cooking method visible (grilled, fried, steamed, raw, etc.)
   - Any garnishes, sauces, or toppings that add calories

3. BE SPECIFIC with food names:
   - Good: "Grilled chicken breast", "White rice", "Steamed broccoli"
   - Avoid vague: "Meat", "Vegetable", "Grain"
   - If uncertain between similar items, choose the most common option

4. For PORTION SIZES, use visual cues:
   - Compare to standard plate size (~9-10 inches)
   - Estimate volume or weight (cups, ounces, grams)
   - Consider thickness and density of items

5. NUTRITIONAL ESTIMATION:
   - Base estimates on USDA standard portion sizes
   - Account for visible oils, butter, or cooking fats
   - Include all components (sauces, dressings, toppings)
   - Round to realistic numbers (avoid overly precise values)

6. CONFIDENCE LEVEL:
   - If you're highly confident: provide standard estimates
   - If uncertain about exact food type: add "~" before calories to indicate approximation
   - If item is partially hidden/unclear: note this in portion description

7. For COMPLEX DISHES (casseroles, mixed dishes, sandwiches):
   - Break down into main components when possible
   - OR treat as single item with combined nutrition

Respond ONLY with valid JSON in this exact format, no other text:
{
  "foods": [
    {
      "name": "Specific Food Item Name",
      "portion": "detailed portion description (e.g., '6 oz grilled chicken breast' or '1 cup cooked white rice')",
      "calories": 000,
      "protein": 00,
      "carbs": 00,
      "fiber": 00,
      "fat": 00,
      "confidence": "high|medium|low"
    }
  ],
  "totalCalories": 000,
  "totalProtein": 00,
  "totalCarbs": 00,
  "totalFiber": 00,
  "totalFat": 00,
  "mealDescription": "Detailed description of the overall meal including cooking methods and notable ingredients",
  "analysisNotes": "Any important observations, uncertainties, or assumptions made during analysis"
}

If this is not a food image or no food items can be identified, respond with:
{
  "error": "Could not identify food items in this image",
  "foods": [],
  "totalCalories": 0,
  "totalProtein": 0,
  "totalCarbs": 0,
  "totalFiber": 0,
  "totalFat": 0,
  "mealDescription": "",
  "analysisNotes": "No food visible in image"
}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    
    // Check for API errors
    if (!response.ok) {
      const errorMessage = data.error?.message || `API request failed with status ${response.status}`;
      console.error('API Error:', data);
      throw new Error(errorMessage);
    }

    if (data.content && data.content[0] && data.content[0].text) {
      const text = data.content[0].text;
      const cleanedText = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedText);
    }
    
    console.error('Unexpected API response structure:', data);
    throw new Error('Invalid response from API - unexpected response structure');
  } catch (error) {
    console.error('Error analyzing food:', error);
    throw error;
  }
};

// Barcode Lookup Service
const lookupBarcode = async (barcode) => {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const nutriments = product.nutriments || {};
      const servingSize = product.serving_size || product.quantity || '1 serving';
      
      const calories = Math.round(
        nutriments['energy-kcal_serving'] || 
        nutriments['energy-kcal_100g'] || 
        (nutriments['energy_serving'] ? nutriments['energy_serving'] / 4.184 : 0) ||
        (nutriments['energy_100g'] ? nutriments['energy_100g'] / 4.184 : 0) || 0
      );
      
      const protein = Math.round((nutriments.proteins_serving || nutriments.proteins_100g || 0) * 10) / 10;
      const carbs = Math.round((nutriments.carbohydrates_serving || nutriments.carbohydrates_100g || 0) * 10) / 10;
      const fat = Math.round((nutriments.fat_serving || nutriments.fat_100g || 0) * 10) / 10;
      const fiber = Math.round((nutriments.fiber_serving || nutriments.fiber_100g || 0) * 10) / 10;

      return {
        found: true,
        productName: product.product_name || 'Unknown Product',
        brand: product.brands || '',
        servingSize: servingSize,
        imageUrl: product.image_url || product.image_front_url || null,
        foods: [{
          name: product.product_name || 'Unknown Product',
          portion: servingSize,
          calories, protein, carbs, fiber, fat,
        }],
        totalCalories: calories,
        totalProtein: protein,
        totalCarbs: carbs,
        totalFiber: fiber,
        totalFat: fat,
        mealDescription: product.brands
          ? `${product.brands} - ${product.product_name || 'Product'}`
          : product.product_name || 'Scanned Product',
        nutriscore: product.nutriscore_grade || null,
        ingredients: product.ingredients_text || null,
      };
    }
    return { found: false, error: 'Product not found in database' };
  } catch (error) {
    console.error('Error looking up barcode:', error);
    throw error;
  }
};

// Database Service - Save food entry
const saveFoodEntry = async (entry) => {
  try {
    // In a real app, this would call your backend API
    // For now, we'll save to AsyncStorage as a simulation
//    const existingEntries = await AsyncStorage.getItem('food_entries');
//    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
    const newEntry = {
      food_entry_id: Date.now(),
      food_entry_customer_id: API_CONFIG.CUSTOMER_ID,
      food_entry_date: entry.date,
      food_entry_time: entry.time,
      food_entry_meal_id: entry.mealId,
      food_description: entry.description,
      food_image: entry.image, // base64 string
      food_calories: entry.calories,
      food_carbs: entry.carbs,
      food_proteins: entry.proteins,
      food_fats: entry.fats,
      food_fiber: entry.fiber || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
//    entries.push(newEntry);
//    await AsyncStorage.setItem('food_entries', JSON.stringify(entries));
    
//    return { success: true, entry: newEntry };
 
// Import at top of file: import { getAccessToken } from './services/authService';
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/food-entries`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(newEntry),
    });
    return await response.json();

    // const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(newEntry),
    // });
    // return await response.json();
    
  } catch (error) {
    console.error('Error saving food entry:', error);
    throw error;
  }
};

// Database Service - Update food entry
const updateFoodEntry = async (entryId, updatedData) => {
  try {
//    const existingEntries = await AsyncStorage.getItem('food_entries');
//    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
//    const index = entries.findIndex(e => e.food_entry_id === entryId);
//    if (index === -1) {
//      throw new Error('Entry not found');
//    }
    
//    entries[index] = {
//      ...entries[index],
//      food_entry_date: updatedData.date,
//      food_entry_time: updatedData.time,
//      food_entry_meal_id: updatedData.mealId,
//      food_description: updatedData.description,
//      food_calories: updatedData.calories,
//      food_carbs: updatedData.carbs,
//      food_proteins: updatedData.proteins,
//      food_fats: updatedData.fats,
//      updated_at: new Date().toISOString(),
//    };
    
//    await AsyncStorage.setItem('food_entries', JSON.stringify(entries));
    
//    return { success: true, entry: entries[index] };

    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/food-entries/${entryId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(updatedData),
    });
    return await response.json();

    // // Real API call would look like this:
    // const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries/${entryId}`, {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(updatedData),
    // });
    // return await response.json();
    
  } catch (error) {
    console.error('Error updating food entry:', error);
    throw error;
  }
};

// Database Service - Delete food entry
const deleteFoodEntry = async (entryId) => {
  try {
//    const existingEntries = await AsyncStorage.getItem('food_entries');
//    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
//    const filteredEntries = entries.filter(e => e.food_entry_id !== entryId);
//    await AsyncStorage.setItem('food_entries', JSON.stringify(filteredEntries));
    
//    return { success: true };


    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/food-entries/${entryId}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    return await response.json();
     
    // // Real API call would look like this:
    // const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries/${entryId}`, {
    //   method: 'DELETE',
    // });
    // return await response.json();
    
  } catch (error) {
    console.error('Error deleting food entry:', error);
    throw error;
  }
};

// =============================================================================
// SAVED MEALS API FUNCTIONS
// =============================================================================

// Get all saved meals for the user
const getSavedMeals = async () => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/saved-meals`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const result = await response.json();
    if (result.error) {
      console.error('API error:', result.error);
      return [];
    }
    return result;
  } catch (error) {
    console.error('Error getting saved meals:', error);
    return [];
  }
};

// Get saved meals for a specific meal type
const getSavedMealsByMealType = async (mealId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/saved-meals/by-meal/${mealId}`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const result = await response.json();
    if (result.error) {
      console.error('API error:', result.error);
      return [];
    }
    return result;
  } catch (error) {
    console.error('Error getting saved meals by meal type:', error);
    return [];
  }
};

// Save a meal as a favorite
const saveMealAsFavorite = async (meal) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/saved-meals`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        mealId: meal.mealId,
        description: meal.description,
        calories: meal.calories,
        carbs: meal.carbs,
        proteins: meal.proteins,
        fats: meal.fats,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving meal as favorite:', error);
    throw error;
  }
};

// Delete a saved meal
const deleteSavedMeal = async (savedMealId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/saved-meals/${savedMealId}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting saved meal:', error);
    throw error;
  }
};

// Update a saved meal
const updateSavedMeal = async (savedMealId, updates) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/saved-meals/${savedMealId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        description: updates.description,
        calories: updates.calories,
        carbs: updates.carbs,
        proteins: updates.proteins,
        fats: updates.fats,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating saved meal:', error);
    throw error;
  }
};

// =============================================================================
// WEIGHT TRACKING API FUNCTIONS
// =============================================================================

// Save a weight entry
const saveWeightEntry = async (weightData) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/weight-entries`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        weight_date: weightData.date,
        weight_value: weightData.weight,
        weight_unit: weightData.unit,
        notes: weightData.notes || null,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving weight entry:', error);
    throw error;
  }
};

// Get weight entries for the user
const getWeightEntries = async (limit = 30) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/weight-entries?limit=${limit}`,
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    const result = await response.json();
    if (result.error) {
      console.error('API error:', result.error);
      return [];
    }
    return result;
  } catch (error) {
    console.error('Error getting weight entries:', error);
    return [];
  }
};

// Get today's weight entry
const getTodayWeightEntry = async () => {
  try {
    const accessToken = await getAccessToken();
    const today = getLocalDateString();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/weight-entries/by-date?date=${today}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    const result = await response.json();
    if (result.error) {
      return null;
    }
    return result;
  } catch (error) {
    console.error('Error getting today weight entry:', error);
    return null;
  }
};

// Get weight entry for a specific date
const getWeightEntryByDate = async (date) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/weight-entries/by-date?date=${date}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    const result = await response.json();
    if (result.error) {
      return null;
    }
    return result;
  } catch (error) {
    console.error('Error getting weight entry by date:', error);
    return null;
  }
};

// Delete a weight entry
const deleteWeightEntry = async (weightEntryId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/weight-entries/${weightEntryId}`,
      {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    return await response.json();
  } catch (error) {
    console.error('Error deleting weight entry:', error);
    throw error;
  }
};

// Get macro vs weight progress report data
const getMacroWeightProgressReport = async (days = 30) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/reports/macro-weight-progress?days=${days}`,
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    const result = await response.json();
    if (result.error) {
      console.error('API error:', result.error);
      return null;
    }
    return result;
  } catch (error) {
    console.error('Error getting macro weight progress report:', error);
    return null;
  }
};

// Export chart data to CSV file
const exportChartDataToCSV = async (chartDates, chartWeights, chartCalories, chartProteins, chartCarbs, chartFats, weightUnit) => {
  try {
    // Build CSV content
    const headers = ['Date', `Weight (${weightUnit})`, 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'];
    const rows = chartDates.map((date, index) => [
      date,
      chartWeights[index] || '',
      chartCalories[index] || '',
      chartProteins[index] || '',
      chartCarbs[index] || '',
      chartFats[index] || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Generate filename with current date
    const today = new Date();
    const filename = `macro_weight_data_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.csv`;
    
    // Handle differently for web vs mobile
    if (Platform.OS === 'web') {
      // For web: create a blob and download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true };
    } else if (Platform.OS === 'android') {
      // For Android: use Storage Access Framework to let user choose save location
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      
      if (permissions.granted) {
        // User granted access to a directory
        const directoryUri = permissions.directoryUri;
        
        // Create the file in the selected directory
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          directoryUri,
          filename,
          'text/csv'
        );
        
        // Write content to the file
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8
        });
        
        Alert.alert('Download Complete', `File saved as "${filename}"`);
        return { success: true, fileUri };
      } else {
        // User denied permission, fall back to sharing
        Alert.alert('Permission Denied', 'Unable to save file. Please grant storage access to download the file.');
        return { success: false };
      }
    } else {
      // For iOS: save to file and share (iOS doesn't have a public downloads folder)
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Save Macro vs Weight Data'
        });
        return { success: true };
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
        return { success: true, fileUri };
      }
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
    Alert.alert('Export Failed', 'Unable to export data. Please try again.');
    return { success: false, error };
  }
};

// Export Consumption vs Burned data to CSV
const exportConsumptionBurnedToCSV = async (chartDates, chartConsumed, chartBurned, chartNet) => {
  try {
    // Build CSV content
    const headers = ['Date', 'Calories Consumed', 'Calories Burned', 'Net Calories'];
    const rows = chartDates.map((date, index) => [
      date,
      chartConsumed[index] || 0,
      chartBurned[index] || 0,
      chartNet[index] || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Generate filename with current date
    const today = new Date();
    const filename = `consumption_vs_burned_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.csv`;

    // Handle differently for web vs mobile
    if (Platform.OS === 'web') {
      // For web: create a blob and download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true };
    } else if (Platform.OS === 'android') {
      // For Android: use Storage Access Framework to let user choose save location
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        // User granted access to a directory
        const directoryUri = permissions.directoryUri;

        // Create the file in the selected directory
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          directoryUri,
          filename,
          'text/csv'
        );

        // Write content to the file
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8
        });

        Alert.alert('Download Complete', `File saved as "${filename}"`);
        return { success: true, fileUri };
      } else {
        // User denied permission, fall back to sharing
        Alert.alert('Permission Denied', 'Unable to save file. Please grant storage access to download the file.');
        return { success: false };
      }
    } else {
      // For iOS: save to file and share (iOS doesn't have a public downloads folder)
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Save Consumption vs Burned Data'
        });
        return { success: true };
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
        return { success: true, fileUri };
      }
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
    Alert.alert('Export Failed', 'Unable to export data. Please try again.');
    return { success: false, error };
  }
};

// Get entries for a specific date from API
const getEntriesByDate = async (date, customerId = API_CONFIG.CUSTOMER_ID) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/food-entries/by-date?date=${date}`,
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    // Check for session expiration (401 Unauthorized)
    if (response.status === 401) {
      return { entries: [], summary: null, sessionExpired: true };
    }
    
    // const response = await fetch(
    //   `${API_CONFIG.DATABASE_API_URL}/food-entries/by-date?customer_id=${customerId}&date=${date}`
    // );
    const result = await response.json();
    
    if (result.error) {
      console.error('API error:', result.error);
      return { entries: [], summary: null };
    }
    
    // Return both entries and summary from the API
    return {
      entries: result.food_entries || [],
      summary: result.summary || null
    };
  } catch (error) {
    console.error('Error getting entries from API:', error);
    return { entries: [], summary: null };
  }
};

// Get entries for a date range from API
const getEntriesByDateRange = async (startDate, endDate, customerId = API_CONFIG.CUSTOMER_ID) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/food-entries/by-date?start_date=${startDate}&end_date=${endDate}`,
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    // const response = await fetch(
    //   `${API_CONFIG.DATABASE_API_URL}/food-entries/by-date?customer_id=${customerId}&start_date=${startDate}&end_date=${endDate}`
    // );
    const result = await response.json();
    
    if (result.error) {
      console.error('API error:', result.error);
      return { entries: [], summary: null };
    }
    
    return {
      entries: result.food_entries || [],
      summary: result.summary || null
    };
  } catch (error) {
    console.error('Error getting entries from API:', error);
    return { entries: [], summary: null };
  }
};

// Profile API Service - Save/Update customer profile
const saveProfileToAPI = async (profile) => {
//const saveProfileToAPI = async (profile, customerId = null) => {
  try {
    // Convert current weight to kg if needed (for storage)
    let currentWeightInKg = parseFloat(profile.currentWeight) || 0;
    if (profile.weightUnit === 'lbs' && currentWeightInKg > 0) {
      currentWeightInKg = currentWeightInKg * 0.453592; // Convert lbs to kg
    }
    
    // Convert goal weight to kg if needed (for storage)
    let goalWeightInKg = parseFloat(profile.goalWeight) || 0;
    if (profile.weightUnit === 'lbs' && goalWeightInKg > 0) {
      goalWeightInKg = goalWeightInKg * 0.453592; // Convert lbs to kg
    }
    
    // Convert height to cm if needed (for storage)
    let heightInCm = parseFloat(profile.height) || 0;
    if (profile.heightUnit === 'in' && heightInCm > 0) {
      heightInCm = heightInCm * 2.54; // Convert inches to cm
    }
    
    // Calculate macro targets in grams from percentages and calories
    const targetCal = parseInt(profile.targetCalories) || 2000;
    const carbsPct = parseInt(profile.carbsPercent) || 50;
    const proteinsPct = parseInt(profile.proteinsPercent) || 25;
    const fatsPct = parseInt(profile.fatsPercent) || 25;
    
    const targetCarbs = Math.round((targetCal * (carbsPct / 100)) / 4);
    const targetProtein = Math.round((targetCal * (proteinsPct / 100)) / 4);
    const targetFats = Math.round((targetCal * (fatsPct / 100)) / 9);
    
    const customerData = {
      customer_first_name: profile.firstName || 'User',
      customer_last_name: profile.lastName || 'Name',
      customer_age: parseInt(profile.age) || null,
      customer_weight: currentWeightInKg > 0 ? Math.round(currentWeightInKg * 100) / 100 : null,
      customer_goal_weight: goalWeightInKg > 0 ? Math.round(goalWeightInKg * 100) / 100 : null,
      customer_weight_unit: profile.weightUnit || 'kg',
      customer_height: heightInCm > 0 ? Math.round(heightInCm * 100) / 100 : null,
      customer_height_unit: profile.heightUnit || 'cm',
      customer_goal_date: profile.goalDate || null,
      customer_target_calories: parseInt(profile.targetCalories) || null,
      customer_target_protein: targetProtein,
      customer_target_carbs: targetCarbs,
      customer_target_fats: targetFats,
    };

    const accessToken = await getAccessToken();
    // Always use PUT to /customers/me - server creates if not exists
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/customers/me`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(customerData),
    });

    // let response;
    // if (customerId) {
    //   // Update existing customer
    //   response = await fetch(`${API_CONFIG.DATABASE_API_URL}/customers/${customerId}`, {
    //     method: 'PUT',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(customerData),
    //   });
    // } else {
    //   // Create new customer
    //   response = await fetch(`${API_CONFIG.DATABASE_API_URL}/customers`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(customerData),
    //   });
    // }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return { success: true, customer: result };
  } catch (error) {
    console.error('Error saving profile to API:', error);
    throw error;
  }
};

// Profile API Service - Get customer profile
const getProfileFromAPI = async (customerId) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null; // Not logged in
    }
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/customers/me`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const result = await response.json();

    // const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/customers/${customerId}`);
    // const result = await response.json();
    
    if (result.error) {
      return null;
    }
    
    // Convert API response to app profile format
    const targetCal = result.customer_target_calories || 2000;
    const targetProteinGrams = result.customer_target_protein || 0;
    const targetCarbsGrams = result.customer_target_carbs || 0;
    const targetFatsGrams = result.customer_target_fats || 0;
    
    // Calculate percentages from grams
    // Protein & carbs = 4 cal/gram, fats = 9 cal/gram
    const proteinCals = targetProteinGrams * 4;
    const carbsCals = targetCarbsGrams * 4;
    const fatsCals = targetFatsGrams * 9;
    const totalMacroCals = proteinCals + carbsCals + fatsCals;
    
    let carbsPercent = '50';
    let proteinsPercent = '25';
    let fatsPercent = '25';
    
    if (totalMacroCals > 0) {
      carbsPercent = String(Math.round((carbsCals / totalMacroCals) * 100));
      proteinsPercent = String(Math.round((proteinCals / totalMacroCals) * 100));
      fatsPercent = String(Math.round((fatsCals / totalMacroCals) * 100));
      
      // Ensure they add up to 100
      const total = parseInt(carbsPercent) + parseInt(proteinsPercent) + parseInt(fatsPercent);
      if (total !== 100) {
        carbsPercent = String(parseInt(carbsPercent) + (100 - total));
      }
    }
    
    // Convert weight from kg to display unit
    const weightUnit = result.customer_weight_unit || 'kg';
    const heightUnit = result.customer_height_unit || 'cm';
    
    // Get weights in kg from database
    const currentWeightInKg = result.customer_weight || 0;
    const goalWeightInKg = result.customer_goal_weight || 0;
    const heightInCm = result.customer_height || 0;
    
    // Convert to user's preferred unit for display
    let displayCurrentWeight = currentWeightInKg;
    let displayGoalWeight = goalWeightInKg;
    let displayHeight = heightInCm;
    
    if (weightUnit === 'lbs') {
      displayCurrentWeight = currentWeightInKg * 2.20462; // kg to lbs
      displayGoalWeight = goalWeightInKg * 2.20462;
    }
    
    if (heightUnit === 'in') {
      displayHeight = heightInCm / 2.54; // cm to inches
    }
    
    return {
      customerId: result.customer_id,
      firstName: result.customer_first_name || '',
      lastName: result.customer_last_name || '',
      age: result.customer_age ? String(result.customer_age) : '',
      currentWeight: displayCurrentWeight ? String(Math.round(displayCurrentWeight * 10) / 10) : '',
      weightUnit: weightUnit,
      height: displayHeight ? String(Math.round(displayHeight * 10) / 10) : '',
      heightUnit: heightUnit,
      goalWeight: displayGoalWeight ? String(Math.round(displayGoalWeight * 10) / 10) : '',
      goalDate: result.customer_goal_date || '',
      targetCalories: result.customer_target_calories ? String(result.customer_target_calories) : '',
      carbsPercent,
      proteinsPercent,
      fatsPercent,
    };
  } catch (error) {
    console.error('Error getting profile from API:', error);
    return null;
  }
};

// Legacy AsyncStorage functions (kept for backwards compatibility)
const saveProfile = async (profile) => {
  try {
    await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
    return { success: true };
  } catch (error) {
    console.error('Error saving profile:', error);
    throw error;
  }
};

const getProfile = async () => {
  try {
    const profile = await AsyncStorage.getItem('user_profile');
    return profile ? JSON.parse(profile) : null;
  } catch (error) {
    console.error('Error getting profile:', error);
    return null;
  }
};

// =============================================================================
// COMMUNITY API FUNCTIONS
// =============================================================================

// Get community posts feed
const getCommunityPosts = async (type = null, limit = 20, offset = 0) => {
  try {
    const accessToken = await getAccessToken();
    let url = `${API_CONFIG.DATABASE_API_URL}/community/posts?limit=${limit}&offset=${offset}`;
    if (type && type !== 'all') {
      url += `&type=${type}`;
    }
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { posts: [], sessionExpired: true };
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error getting community posts:', error);
    return { posts: [], error: error.message };
  }
};

// Get my community posts
const getMyCommunityPosts = async (limit = 20, offset = 0) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/community/posts?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (response.status === 401) {
      return { posts: [], sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting my posts:', error);
    return { posts: [], error: error.message };
  }
};

// Create a community post
const createCommunityPost = async (postData) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/community/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating post:', error);
    return { error: error.message };
  }
};

// Update a community post
const updateCommunityPost = async (postId, postData) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/community/posts/${postId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating post:', error);
    return { error: error.message };
  }
};

// Delete a community post
const deleteCommunityPost = async (postId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/community/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error deleting post:', error);
    return { error: error.message };
  }
};

// Like a community post
const likeCommunityPost = async (postId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/community/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error liking post:', error);
    return { error: error.message };
  }
};

// Unlike a community post
const unlikeCommunityPost = async (postId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/community/posts/${postId}/like`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error unliking post:', error);
    return { error: error.message };
  }
};

// Get comments for a post
const getPostComments = async (postId, limit = 50, offset = 0) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/community/posts/${postId}/comments?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (response.status === 401) {
      return { comments: [], sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting comments:', error);
    return { comments: [], error: error.message };
  }
};

// Add a comment to a post
const addPostComment = async (postId, commentContent) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment_content: commentContent }),
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error adding comment:', error);
    return { error: error.message };
  }
};

// Delete a comment
const deletePostComment = async (postId, commentId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/community/posts/${postId}/comments/${commentId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { error: error.message };
  }
};

// =============================================================================
// DIARY API FUNCTIONS
// =============================================================================

// Get diary entry for a specific date
const getDiaryEntryByDate = async (date) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${API_CONFIG.DATABASE_API_URL}/my/diary?date=${date}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (response.status === 401) {
      return { diary_entry: null, sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting diary entry:', error);
    return { diary_entry: null, error: error.message };
  }
};

// Get all diary entries
const getDiaryEntries = async (limit = 30, offset = 0, startDate = null, endDate = null) => {
  try {
    const accessToken = await getAccessToken();
    let url = `${API_CONFIG.DATABASE_API_URL}/my/diary/entries?limit=${limit}&offset=${offset}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { entries: [], sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting diary entries:', error);
    return { entries: [], error: error.message };
  }
};

// Create or update diary entry (uses UPSERT on backend)
const saveDiaryEntry = async (entryData) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/diary`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entryData),
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error saving diary entry:', error);
    return { error: error.message };
  }
};

// Update diary entry by ID
const updateDiaryEntry = async (diaryId, entryData) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/diary/${diaryId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entryData),
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating diary entry:', error);
    return { error: error.message };
  }
};

// Delete diary entry
const deleteDiaryEntry = async (diaryId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/my/diary/${diaryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      return { error: 'Session expired', sessionExpired: true };
    }
    return await response.json();
  } catch (error) {
    console.error('Error deleting diary entry:', error);
    return { error: error.message };
  }
};

// =============================================================================
// UI COMPONENTS
// =============================================================================

// Tab Bar Component
const TabBar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'today', icon: '📊', label: 'Today' },
    { id: 'profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
          onPress={() => onTabChange(tab.id)}
        >
          <Text style={styles.tabIcon}>{tab.icon}</Text>
          <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Meal Selector Component
const MealSelector = ({ selectedMeal, onSelect }) => (
  <View style={styles.mealSelectorContainer}>
    <Text style={styles.mealSelectorTitle}>Select Meal Type</Text>
    <View style={styles.mealGrid}>
      {MEAL_TYPES.map(meal => (
        <TouchableOpacity
          key={meal.id}
          style={[
            styles.mealOption,
            selectedMeal?.id === meal.id && { borderColor: meal.color, borderWidth: 3 }
          ]}
          onPress={() => onSelect(meal)}
        >
          <LinearGradient
            colors={[meal.color, meal.color + 'AA']}
            style={styles.mealOptionGradient}
          >
            <Text style={styles.mealOptionIcon}>{meal.icon}</Text>
            <Text style={styles.mealOptionName}>{meal.name}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// Progress Ring Component
const ProgressRing = ({ progress, color, size = 80, strokeWidth = 8, label, value, unit }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progressValue = Math.min(Math.max(progress, 0), 100);
  
  return (
    <View style={[styles.progressRing, { width: size, height: size }]}>
      <View style={styles.progressRingInner}>
        <Text style={[styles.progressValue, { color }]}>{value}</Text>
        <Text style={styles.progressUnit}>{unit}</Text>
      </View>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={[styles.progressBar, { backgroundColor: color + '30' }]}>
        <View style={[styles.progressFill, { width: `${progressValue}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

// Macro Card Component
const MacroCard = ({ label, value, unit, color, icon, delay }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [value]);

  return (
    <Animated.View
      style={[
        styles.macroCard,
        { transform: [{ scale: scaleValue }], opacity: animatedValue },
      ]}
    >
      <LinearGradient colors={[color + '20', color + '05']} style={styles.macroGradient}>
        <Text style={styles.macroIcon}>{icon}</Text>
        <Text style={[styles.macroValue, { color }]}>{value}</Text>
        <Text style={styles.macroUnit}>{unit}</Text>
        <Text style={styles.macroLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
};

// Food Item Card
const FoodItemCard = ({ item, index }) => {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.foodItemCard, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
      <View style={styles.foodItemHeader}>
        <Text style={styles.foodItemName}>{item.name}</Text>
        <Text style={styles.foodItemPortion}>{item.portion}</Text>
      </View>
      <View style={styles.foodItemMacros}>
        {[
          { val: item.calories, label: 'kcal', color: '#fff' },
          { val: `${item.protein}g`, label: 'protein', color: '#FF6B6B' },
          { val: `${item.carbs || 0}g`, label: 'carbs', color: '#FFE66D' },
          { val: `${Math.max(0, (item.carbs || 0) - (item.fiber || 0))}g`, label: 'net', color: '#4ECDC4' },
          { val: `${item.fiber || 0}g`, label: 'fiber', color: '#8E44AD' },
          { val: `${item.fat}g`, label: 'fat', color: '#A78BFA' },
        ].map((m, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.miniMacroDivider} />}
            <View style={styles.miniMacro}>
              <Text style={[styles.miniMacroValue, { color: m.color }]}>{m.val}</Text>
              <Text style={styles.miniMacroLabel}>{m.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </Animated.View>
  );
};

// Mode Button Component
const ModeButton = ({ icon, title, subtitle, onPress, color, delay }) => {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <TouchableOpacity style={styles.modeButton} onPress={onPress} activeOpacity={0.8}>
        <LinearGradient colors={[color, color + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modeButtonGradient}>
          <Text style={styles.modeButtonIcon}>{icon}</Text>
          <View style={styles.modeButtonTextContainer}>
            <Text style={styles.modeButtonTitle}>{title}</Text>
            <Text style={styles.modeButtonSubtitle}>{subtitle}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Nutri-Score Badge
const NutriscoreBadge = ({ grade }) => {
  if (!grade) return null;
  const colors = { a: '#038141', b: '#85BB2F', c: '#FECB02', d: '#EE8100', e: '#E63E11' };
  return (
    <View style={[styles.nutriscoreBadge, { backgroundColor: colors[grade.toLowerCase()] || '#888' }]}>
      <Text style={styles.nutriscoreText}>Nutri-Score {grade.toUpperCase()}</Text>
    </View>
  );
};

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

export default function App() {
// Authentication state
  const [authState, setAuthState] = useState('loading'); // 'loading', 'login', 'register', 'forgot', 'authenticated'
  const [sessionExpired, setSessionExpired] = useState(false);
  const [registerData, setRegisterData] = useState({});
  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState('home');
  const [screen, setScreen] = useState('main');
  const [screenHistory, setScreenHistory] = useState([]);

  // Navigate to a new screen and track history
  const navigateTo = useCallback((newScreen) => {
    setScreenHistory(prev => [...prev, screen]);
    setScreen(newScreen);
  }, [screen]);

  // Go back to previous screen with state cleanup
  const goBack = useCallback((cleanupFn) => {
    if (screenHistory.length > 0) {
      const newHistory = [...screenHistory];
      const previousScreen = newHistory.pop();
      setScreenHistory(newHistory);
      setScreen(previousScreen);
      // Run any cleanup function provided
      if (cleanupFn && typeof cleanupFn === 'function') {
        cleanupFn();
      }
      return true;
    }
    return false;
  }, [screenHistory]);

  // Handle hardware back button (Android) and swipe gestures (iOS)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'main') {
        // Screen-specific cleanup when going back
        if (screen === 'mealModeSelect') {
          goBack(() => setSelectedMeal(null));
        } else if (screen === 'viewPost') {
          goBack(() => {
            setViewingPost(null);
            setPostComments([]);
            setNewComment('');
          });
        } else if (screen === 'editPost') {
          goBack(() => {
            setEditingPost(null);
            setEditPostContent('');
            setEditPostImage(null);
          });
        } else if (screen === 'createPost') {
          goBack(() => {
            setNewPostContent('');
            setNewPostImage(null);
          });
        } else if (screen === 'edit') {
          goBack(() => {
            setEditingEntry(null);
            setBaseEditEntryNutrition(null);
            setEditEntryServings('1');
          });
        } else {
          goBack();
        }
        return true;
      }
      return false; // Let system handle it (exit app)
    });

    return () => backHandler.remove();
  }, [screen, goBack]);

  // Go to main/home screen and clear history
  const goHome = useCallback(() => {
    setScreen('main');
    setScreenHistory([]);
  }, []);

  // Handle tab changes - reset screen to main when switching tabs
  // Using useCallback to ensure stable function reference
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    goHome();
  }, [goHome]);
  
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState(null);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Manual entry state
  const [manualEntry, setManualEntry] = useState({
    date: '',
    time: '',
    description: '',
    calories: '',
    proteins: '',
    carbs: '',
    fats: '',
    fiber: '',
    servings: '1',
  });
  
  // Food search state
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [isSearchingFood, setIsSearchingFood] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [baseNutrition, setBaseNutrition] = useState(null);
  
  // Barcode servings state
  const [barcodeServings, setBarcodeServings] = useState('1');
  const [baseBarcodeNutrition, setBaseBarcodeNutrition] = useState(null);
  
  // Saved meals state
  const [savedMeals, setSavedMeals] = useState([]);
  const [savedMealsForMeal, setSavedMealsForMeal] = useState([]);
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);
  const [editingSavedMeal, setEditingSavedMeal] = useState(null);
  const [savedMealServings, setSavedMealServings] = useState('1');
  const [baseSavedMealNutrition, setBaseSavedMealNutrition] = useState(null);
  
  // Weight tracking state
  const [weightEntry, setWeightEntry] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const [todayWeight, setTodayWeight] = useState(null);
  
  // Reports state
  const [reportData, setReportData] = useState(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportDateRange, setReportDateRange] = useState(7); // days

  // Community state
  const [communityPosts, setCommunityPosts] = useState([]);
  const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);
  const [communityPostType, setCommunityPostType] = useState('all'); // 'all', 'progress', 'viewpoint', 'feedback', 'photo', 'general'
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostType, setNewPostType] = useState('general');
  const [newPostImage, setNewPostImage] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostImage, setEditPostImage] = useState(null);
  const [viewingPost, setViewingPost] = useState(null);
  const [postComments, setPostComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // Diary state
  const [diaryEntry, setDiaryEntry] = useState(null);
  const [isLoadingDiary, setIsLoadingDiary] = useState(false);
  const [diaryContent, setDiaryContent] = useState('');
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryMood, setDiaryMood] = useState(null);
  const [isEditingDiary, setIsEditingDiary] = useState(false);

  // Health provider state
  const [connectedProviders, setConnectedProviders] = useState([]);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [consumptionBurnedData, setConsumptionBurnedData] = useState(null);
  const [consumptionBurnedDateRange, setConsumptionBurnedDateRange] = useState(7);

  // Edit entry state
  const [editingEntry, setEditingEntry] = useState(null);
  const [editEntryServings, setEditEntryServings] = useState('1');
  const [baseEditEntryNutrition, setBaseEditEntryNutrition] = useState(null);
  
  // Profile state
  const [profile, setProfile] = useState({
    customerId: null,
    firstName: '',
    lastName: '',
    age: '',
    currentWeight: '',
    weightUnit: 'kg', // 'kg' or 'lbs'
    height: '',
    heightUnit: 'cm', // 'cm' or 'in'
    goalWeight: '',
    goalDate: '',
    targetCalories: '',
    carbsPercent: '50',
    proteinsPercent: '25',
    fatsPercent: '25',
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  
  // Today's tracking
  const [todayEntries, setTodayEntries] = useState([]);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0, carbs: 0, proteins: 0, fats: 0, fiber: 0
  });
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');

  const cameraRef = useRef(null);

  // Check authentication on app load
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const authenticated = await isAuthenticated();
      if (authenticated) {
        // Get user profile to get customer_id
        const profileResult = await getMyProfile();
        if (profileResult.success && profileResult.profile) {
          // Update the customer ID in config
          API_CONFIG.CUSTOMER_ID = profileResult.profile.customer_id;
          await storeCustomerId(profileResult.profile.customer_id);
          setAuthState('authenticated');
          // NOW load the data after authentication is confirmed
          loadTodayEntries();
          loadProfile();
        } else {
          setAuthState('login');
        }
      } else {
        setAuthState('login');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setAuthState('login');
    }
  };

  const handleLogin = async (result) => {
    // After successful login, get profile to get customer_id
    const profileResult = await getMyProfile();
    if (profileResult.success && profileResult.profile) {
      API_CONFIG.CUSTOMER_ID = profileResult.profile.customer_id;
      await storeCustomerId(profileResult.profile.customer_id);
    }
    setAuthState('authenticated');
    loadTodayEntries(); // Refresh data
    loadProfile();
  };

  const handleLogout = async () => {
    await logout();
    API_CONFIG.CUSTOMER_ID = null;
    setAuthState('login');
  };

  const handleSessionExpired = async () => {
    // Clear the session expired flag
    setSessionExpired(false);
    // Log out the user and show login screen
    await logout();
    API_CONFIG.CUSTOMER_ID = null;
    setAuthState('login');
  };

  const loadProfile = async () => {
    setIsLoadingProfile(true);
    try {
      // Try to load from API first
      const apiProfile = await getProfileFromAPI();
//      const apiProfile = await getProfileFromAPI(API_CONFIG.CUSTOMER_ID);
      if (apiProfile) {
        setProfile(apiProfile);
        // Update CUSTOMER_ID if we got a different one
        if (apiProfile.customerId) {
          API_CONFIG.CUSTOMER_ID = apiProfile.customerId;
        }
      } else {
        // Fallback to AsyncStorage for backwards compatibility
        const savedProfile = await getProfile();
        if (savedProfile) {
          setProfile(prev => ({ ...prev, ...savedProfile }));
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      // Fallback to AsyncStorage
      const savedProfile = await getProfile();
      if (savedProfile) {
        setProfile(prev => ({ ...prev, ...savedProfile }));
      }
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const loadTodayEntries = async () => {
    setIsLoadingEntries(true);
    try {
      const result = await getEntriesByDate(selectedDate);
      
      // Check for session expiration
      if (result.sessionExpired) {
        setSessionExpired(true);
        setIsLoadingEntries(false);
        return;
      }
      
      // Set entries from API response
      setTodayEntries(result.entries || []);
      
      // Use summary from API if available, otherwise calculate locally
      if (result.summary) {
        setTodayTotals({
          calories: result.summary.total_calories || 0,
          carbs: result.summary.total_carbs || 0,
          proteins: result.summary.total_proteins || 0,
          fats: result.summary.total_fats || 0,
          fiber: result.summary.total_fiber || 0,
        });
      } else {
        // Fallback: calculate totals from entries
        const entries = result.entries || [];
        const totals = entries.reduce((acc, entry) => ({
          calories: acc.calories + (entry.food_calories || 0),
          carbs: acc.carbs + parseFloat(entry.food_carbs || 0),
          proteins: acc.proteins + parseFloat(entry.food_proteins || 0),
          fats: acc.fats + parseFloat(entry.food_fats || 0),
          fiber: acc.fiber + parseFloat(entry.food_fiber || 0),
        }), { calories: 0, carbs: 0, proteins: 0, fats: 0, fiber: 0 });

        setTodayTotals(totals);
      }
    } catch (error) {
      console.error('Error loading entries:', error);
      setTodayEntries([]);
      setTodayTotals({ calories: 0, carbs: 0, proteins: 0, fats: 0, fiber: 0 });
    } finally {
      setIsLoadingEntries(false);
    }
  };

  // Load community posts
  const loadCommunityPosts = async (type = null) => {
    setIsLoadingCommunity(true);
    try {
      const result = await getCommunityPosts(type || communityPostType);
      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }
      setCommunityPosts(result.posts || []);
    } catch (error) {
      console.error('Error loading community posts:', error);
      setCommunityPosts([]);
    } finally {
      setIsLoadingCommunity(false);
    }
  };

  // Load diary entry for a specific date
  const loadDiaryEntry = async (date) => {
    setIsLoadingDiary(true);
    setIsEditingDiary(false);
    try {
      const result = await getDiaryEntryByDate(date);
      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }
      const entry = result.diary_entry;
      setDiaryEntry(entry);
      setDiaryContent(entry?.entry_content || '');
      setDiaryTitle(entry?.entry_title || '');
      setDiaryMood(entry?.mood || null);
    } catch (error) {
      console.error('Error loading diary entry:', error);
      setDiaryEntry(null);
      setDiaryContent('');
      setDiaryTitle('');
      setDiaryMood(null);
    } finally {
      setIsLoadingDiary(false);
    }
  };

  // Save diary entry
  const handleSaveDiary = async () => {
    if (!diaryContent.trim()) {
      Alert.alert('Error', 'Please enter some content for your diary entry.');
      return;
    }

    setIsLoadingDiary(true);
    try {
      const entryData = {
        entry_date: selectedDate,
        entry_title: diaryTitle.trim() || null,
        entry_content: diaryContent.trim(),
        mood: diaryMood,
      };

      const result = await saveDiaryEntry(entryData);

      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error);
        return;
      }

      setDiaryEntry(result);
      setIsEditingDiary(false);
      Alert.alert('Success', 'Diary entry saved!');
    } catch (error) {
      console.error('Error saving diary:', error);
      Alert.alert('Error', 'Failed to save diary entry.');
    } finally {
      setIsLoadingDiary(false);
    }
  };

  // Delete diary entry
  const handleDeleteDiary = async () => {
    if (!diaryEntry?.diary_id) return;

    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this diary entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsLoadingDiary(true);
            try {
              const result = await deleteDiaryEntry(diaryEntry.diary_id);
              if (result.sessionExpired) {
                setSessionExpired(true);
                return;
              }
              setDiaryEntry(null);
              setDiaryContent('');
              setDiaryTitle('');
              setDiaryMood(null);
              Alert.alert('Deleted', 'Diary entry has been deleted.');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete diary entry.');
            } finally {
              setIsLoadingDiary(false);
            }
          }
        }
      ]
    );
  };

  // Handle like/unlike community post
  const handleToggleLike = async (post) => {
    const wasLiked = post.is_liked_by_me;
    const newLikeCount = wasLiked ? post.likes_count - 1 : post.likes_count + 1;

    // Optimistically update local state
    setCommunityPosts(prevPosts =>
      prevPosts.map(p =>
        p.post_id === post.post_id
          ? { ...p, is_liked_by_me: !wasLiked, likes_count: newLikeCount }
          : p
      )
    );

    // Also update viewingPost if we're viewing this post
    if (viewingPost && viewingPost.post_id === post.post_id) {
      setViewingPost(prev => ({
        ...prev,
        is_liked_by_me: !wasLiked,
        likes_count: newLikeCount
      }));
    }

    try {
      if (wasLiked) {
        await unlikeCommunityPost(post.post_id);
      } else {
        await likeCommunityPost(post.post_id);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert on error
      setCommunityPosts(prevPosts =>
        prevPosts.map(p =>
          p.post_id === post.post_id
            ? { ...p, is_liked_by_me: wasLiked, likes_count: post.likes_count }
            : p
        )
      );
      if (viewingPost && viewingPost.post_id === post.post_id) {
        setViewingPost(prev => ({
          ...prev,
          is_liked_by_me: wasLiked,
          likes_count: post.likes_count
        }));
      }
    }
  };

  // Create new community post
  const handleCreatePost = async () => {
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Please enter some content for your post.');
      return;
    }

    setIsLoadingCommunity(true);
    try {
      const postData = {
        post_type: newPostType,
        post_title: newPostTitle.trim() || null,
        post_content: newPostContent.trim(),
        post_image: newPostImage,
        is_public: true,
      };

      const result = await createCommunityPost(postData);

      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error);
        return;
      }

      // Reset form and reload posts
      setNewPostContent('');
      setNewPostTitle('');
      setNewPostType('general');
      setNewPostImage(null);
      goBack();
      loadCommunityPosts();
      Alert.alert('Success', 'Post created!');
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post.');
    } finally {
      setIsLoadingCommunity(false);
    }
  };

  // Delete community post
  const handleDeletePost = async (postId) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteCommunityPost(postId);
              if (result.sessionExpired) {
                setSessionExpired(true);
                return;
              }
              loadCommunityPosts();
              if (viewingPost?.post_id === postId) {
                setViewingPost(null);
                goBack();
              }
              Alert.alert('Deleted', 'Post has been deleted.');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete post.');
            }
          }
        }
      ]
    );
  };

  // Start editing a community post
  const handleStartEditPost = (post) => {
    setEditingPost(post);
    setEditPostContent(post.post_content);
    setEditPostImage(post.post_image);
    navigateTo('editPost');
  };

  // Save edited community post
  const handleSaveEditPost = async () => {
    if (!editPostContent.trim()) {
      Alert.alert('Error', 'Post content cannot be empty.');
      return;
    }

    setIsLoadingCommunity(true);
    try {
      const postData = {
        post_content: editPostContent.trim(),
        post_image: editPostImage,
      };

      const result = await updateCommunityPost(editingPost.post_id, postData);
      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }

      // Clear editing state
      setEditingPost(null);
      setEditPostContent('');
      setEditPostImage(null);

      // Refresh posts and go back
      loadCommunityPosts();
      goBack();
      Alert.alert('Success', 'Post updated successfully.');
    } catch (error) {
      console.error('Error updating post:', error);
      Alert.alert('Error', 'Failed to update post. Please try again.');
    } finally {
      setIsLoadingCommunity(false);
    }
  };

  // Load comments for a post
  const loadPostComments = async (postId) => {
    setIsLoadingComments(true);
    try {
      const result = await getPostComments(postId);
      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }
      setPostComments(result.comments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
      setPostComments([]);
    } finally {
      setIsLoadingComments(false);
    }
  };

  // Add comment to post
  const handleAddComment = async (postId) => {
    if (!newComment.trim()) return;

    try {
      const result = await addPostComment(postId, newComment.trim());
      if (result.sessionExpired) {
        setSessionExpired(true);
        return;
      }
      if (result.error) {
        Alert.alert('Error', result.error);
        return;
      }
      setNewComment('');
      loadPostComments(postId);
      loadCommunityPosts(); // Refresh to update comment count
    } catch (error) {
      Alert.alert('Error', 'Failed to add comment.');
    }
  };

  // Reload entries when selectedDate changes (only if authenticated)
  useEffect(() => {
    if (authState === 'authenticated') {
      loadTodayEntries();
    }
  }, [selectedDate]);

  // Reload entries when switching to home or today tab (only if authenticated)
  useEffect(() => {
    if (authState === 'authenticated' && (activeTab === 'home' || activeTab === 'today') && screen === 'main') {
      loadTodayEntries();
    }
  }, [activeTab, screen, authState]);

  // Set up OAuth deep link listener for health providers
  useEffect(() => {
    if (authState !== 'authenticated') return;

    // Set available providers based on platform
    setAvailableProviders(getAvailableProviders());

    // Set up deep link listener for OAuth callbacks
    const cleanup = setupOAuthDeepLinkListener(async (result) => {
      if (result.success) {
        Alert.alert('Connected!', `Successfully connected to ${result.provider || 'health provider'}.`);
        await loadConnectedProviders();
      } else {
        Alert.alert('Connection Failed', result.error || 'Failed to connect health provider.');
      }
    });

    // Load connected providers
    loadConnectedProviders();

    return cleanup;
  }, [authState]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodayEntries();
    setRefreshing(false);
  }, [selectedDate]);

  // Date navigation functions
  const goToPreviousDay = () => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() - 1);
    setSelectedDate(getLocalDateString(current));
  };

  const goToNextDay = () => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() + 1);
    setSelectedDate(getLocalDateString(current));
  };

  const goToToday = () => {
    setSelectedDate(getLocalDateString());
  };

  const todayDateString = getLocalDateString();
  const isToday = selectedDate === todayDateString;
  const isFutureDate = parseLocalDate(selectedDate) > parseLocalDate(todayDateString);

  // Format date for display
  const formatDisplayDate = (dateString) => {
    const today = getLocalDateString();
    const yesterday = getLocalDateString((() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    })());
    
    if (dateString === today) {
      return 'Today';
    } else if (dateString === yesterday) {
      return 'Yesterday';
    } else {
      const date = parseLocalDate(dateString);
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  // Calculate macro targets from profile
  const getTargets = () => {
    const targetCal = parseInt(profile.targetCalories) || 2000;
    const carbsPct = parseInt(profile.carbsPercent) || 50;
    const proteinsPct = parseInt(profile.proteinsPercent) || 25;
    const fatsPct = parseInt(profile.fatsPercent) || 25;
    
    return {
      calories: targetCal,
      carbs: Math.round((targetCal * (carbsPct / 100)) / 4), // 4 cal per gram
      proteins: Math.round((targetCal * (proteinsPct / 100)) / 4), // 4 cal per gram
      fats: Math.round((targetCal * (fatsPct / 100)) / 9), // 9 cal per gram
    };
  };

  // Handle profile save
  const handleSaveProfile = async () => {
    // Validate required fields
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      Alert.alert('Missing Information', 'Please enter your first and last name.');
      return;
    }
    
    const carbsPct = parseInt(profile.carbsPercent) || 0;
    const proteinsPct = parseInt(profile.proteinsPercent) || 0;
    const fatsPct = parseInt(profile.fatsPercent) || 0;
    
    if (carbsPct + proteinsPct + fatsPct !== 100) {
      Alert.alert('Invalid Percentages', 'Carbs, Proteins, and Fats percentages must add up to 100%');
      return;
    }
    
    setIsSaving(true);
    try {
      const result = await saveProfileToAPI(profile);
//      const result = await saveProfileToAPI(profile, profile.customerId);
      
      if (result.success && result.customer) {
        // Update profile with customer ID from API
        const newCustomerId = result.customer.customer_id;
        setProfile(prev => ({ ...prev, customerId: newCustomerId }));
        API_CONFIG.CUSTOMER_ID = newCustomerId;
        
        // Also save to AsyncStorage as backup
        await saveProfile({ ...profile, customerId: newCustomerId });
      }
      
      setIsEditingProfile(false);
      Alert.alert('Success', 'Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle saving food entry to database
  const handleSaveEntry = async () => {
    if (!analysisResult || !selectedMeal) return;
    
    setIsSaving(true);
    try {
      const now = new Date();
      const entry = {
        date: selectedDate,
        time: now.toTimeString().split(' ')[0],
        mealId: selectedMeal.id,
        description: analysisResult.mealDescription || 'Food entry',
        image: capturedImage?.base64 || null,
        calories: analysisResult.totalCalories,
        carbs: analysisResult.totalCarbs,
        proteins: analysisResult.totalProtein,
        fats: analysisResult.totalFat,
        fiber: analysisResult.totalFiber || 0,
      };
      
      await saveFoodEntry(entry);
      await loadTodayEntries();
      
      Alert.alert('Success', 'Food entry saved!', [
        { text: 'OK', onPress: resetToHome }
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save food entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Take photo handler
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1568 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        setCapturedImage(manipulatedImage);
        setError(null);
        navigateTo('results');
        analyzeFood(manipulatedImage.base64);
      } catch (err) {
        console.error('Error taking picture:', err);
        setError('Failed to capture image. Please try again.');
      }
    }
  };

  const analyzeFood = async (base64Image) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setError(null);

    try {
      const result = await analyzeFoodImage(base64Image);
      if (result.error) {
        setError(result.error);
      } else {
        setAnalysisResult(result);
      }
    } catch (err) {
      setError('Failed to analyze food. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBarcodeScanned = async ({ type, data }) => {
    if (!isScanning) return;
    
    setIsScanning(false);
    Vibration.vibrate(100);
    setScannedBarcode(data);
    navigateTo('results');
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setBaseBarcodeNutrition(null);
    setBarcodeServings('1');
    setError(null);

    try {
      const result = await lookupBarcode(data);
      if (!result.found) {
        setError(`Product not found for barcode: ${data}`);
      } else {
        setAnalysisResult(result);
        // Store base nutrition for serving size calculations
        setBaseBarcodeNutrition({
          calories: result.totalCalories,
          protein: result.totalProtein,
          carbs: result.totalCarbs,
          fiber: result.totalFiber || 0,
          fat: result.totalFat,
        });
      }
    } catch (err) {
      setError('Failed to look up product. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetToHome = () => {
    goHome();
    setActiveTab('home');
    setCapturedImage(null);
    setAnalysisResult(null);
    setError(null);
    setScanMode(null);
    setScannedBarcode(null);
    setIsScanning(true);
    setSelectedMeal(null);
    setBarcodeServings('1');
    setBaseBarcodeNutrition(null);
  };

  const goToCamera = () => {
    setScanMode('photo');
    navigateTo('camera');
  };

  const goToBarcode = () => {
    setScanMode('barcode');
    setIsScanning(true);
    navigateTo('barcode');
  };

  // Navigate to food search screen (replaces old manual entry)
  const goToFoodSearch = () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    // Reset food search state
    setFoodSearchQuery('');
    setFoodSearchResults([]);
    setSelectedFood(null);
    setBaseNutrition(null);
    
    // Initialize manual entry with selected date (for adding to past days)
    setManualEntry({
      date: selectedDate,
      time: currentTime,
      description: '',
      calories: '',
      proteins: '',
      carbs: '',
      fats: '',
      fiber: '',
      servings: '1',
    });

    setScanMode('manual');
    navigateTo('foodSearch');
  };

  // Search for foods using FatSecret API
  const handleFoodSearch = async () => {
    if (!foodSearchQuery.trim()) {
      return;
    }
    
    setIsSearchingFood(true);
    try {
      const result = await searchFoods(foodSearchQuery.trim());
      if (result.success) {
        setFoodSearchResults(result.foods);
      } else {
        Alert.alert('Search Error', result.error || 'Failed to search for foods');
        setFoodSearchResults([]);
      }
    } catch (error) {
      console.error('Food search error:', error);
      Alert.alert('Error', 'Failed to search for foods. Please try again.');
      setFoodSearchResults([]);
    } finally {
      setIsSearchingFood(false);
    }
  };

  // Handle food selection from search results
  const handleSelectFood = async (food) => {
    // Fetch detailed food info to get fiber and full nutrition data
    let detailedFood = food;
    try {
      const detailsResult = await getFoodDetails(food.id);
      if (detailsResult.success && detailsResult.food && detailsResult.food.servings.length > 0) {
        // Use the first serving's nutrition data (most common serving size)
        const firstServing = detailsResult.food.servings[0];
        detailedFood = {
          ...food,
          calories: firstServing.calories,
          protein: firstServing.protein,
          carbs: firstServing.carbs,
          fat: firstServing.fat,
          fiber: firstServing.fiber,
          servingDescription: firstServing.servingDescription || food.servingDescription,
        };
      }
    } catch (error) {
      console.log('Could not fetch detailed food info, using search data:', error);
    }

    setSelectedFood(detailedFood);

    // Store base nutrition values for serving calculations
    const base = {
      calories: detailedFood.calories || 0,
      protein: detailedFood.protein || 0,
      carbs: detailedFood.carbs || 0,
      fat: detailedFood.fat || 0,
      fiber: detailedFood.fiber || 0,
    };
    setBaseNutrition(base);

    // Set manual entry with selected food data
    setManualEntry(prev => ({
      ...prev,
      description: detailedFood.brandName ? `${detailedFood.name} (${detailedFood.brandName})` : detailedFood.name,
      calories: String(Math.round(detailedFood.calories || 0)),
      proteins: String(Math.round((detailedFood.protein || 0) * 10) / 10),
      carbs: String(Math.round((detailedFood.carbs || 0) * 10) / 10),
      fats: String(Math.round((detailedFood.fat || 0) * 10) / 10),
      fiber: String(Math.round((detailedFood.fiber || 0) * 10) / 10),
      servings: '1',
    }));

    // Navigate to the food entry form screen
    navigateTo('manual');
  };

  // Handle serving size change
  const handleServingsChange = (newServings) => {
    const servingsNum = parseFloat(newServings) || 0;

    setManualEntry(prev => {
      if (baseNutrition && servingsNum > 0) {
        const calculated = calculateServingNutrition(baseNutrition, servingsNum);
        return {
          ...prev,
          servings: newServings,
          calories: String(calculated.calories),
          proteins: String(calculated.protein),
          carbs: String(calculated.carbs),
          fats: String(calculated.fat),
          fiber: String(Math.round((baseNutrition.fiber || 0) * servingsNum * 10) / 10),
        };
      }
      return { ...prev, servings: newServings };
    });
  };

  // Handle barcode serving size change
  const handleBarcodeServingsChange = (newServings) => {
    const servingsNum = parseFloat(newServings) || 0;
    setBarcodeServings(newServings);

    if (baseBarcodeNutrition && servingsNum > 0) {
      const updatedCalories = Math.round(baseBarcodeNutrition.calories * servingsNum);
      const updatedProtein = Math.round(baseBarcodeNutrition.protein * servingsNum * 10) / 10;
      const updatedCarbs = Math.round(baseBarcodeNutrition.carbs * servingsNum * 10) / 10;
      const updatedFiber = Math.round((baseBarcodeNutrition.fiber || 0) * servingsNum * 10) / 10;
      const updatedFat = Math.round(baseBarcodeNutrition.fat * servingsNum * 10) / 10;

      setAnalysisResult(prev => ({
        ...prev,
        totalCalories: updatedCalories,
        totalProtein: updatedProtein,
        totalCarbs: updatedCarbs,
        totalFiber: updatedFiber,
        totalFat: updatedFat,
        foods: prev.foods?.map((food, idx) => idx === 0 ? {
          ...food,
          calories: updatedCalories,
          protein: updatedProtein,
          carbs: updatedCarbs,
          fiber: updatedFiber,
          fat: updatedFat,
        } : food),
      }));
    }
  };

  // Navigate to manual entry (skip food search - for direct manual entry)
  const goToManualEntry = () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    // Clear any selected food
    setSelectedFood(null);
    setBaseNutrition(null);

    // Use selectedDate for adding entries to past days
    setManualEntry({
      date: selectedDate,
      time: currentTime,
      description: '',
      calories: '',
      proteins: '',
      carbs: '',
      fats: '',
      fiber: '',
      servings: '1',
    });
    setScanMode('manual');
    navigateTo('manual');
  };

  // Navigate to saved meals screen
  const goToSavedMeals = async () => {
    setIsLoadingSavedMeals(true);
    setSavedMealsForMeal([]);
    navigateTo('savedMeals');
    
    try {
      const meals = await getSavedMealsByMealType(selectedMeal.id);
      setSavedMealsForMeal(meals);
    } catch (error) {
      console.error('Error loading saved meals:', error);
      Alert.alert('Error', 'Failed to load saved meals');
    } finally {
      setIsLoadingSavedMeals(false);
    }
  };

  // Navigate to weight entry screen
  const goToAddWeight = async () => {
    setWeightEntry('');
    setWeightNotes('');
    setTodayWeight(null);

    let weightFromHealth = null;
    let existingEntry = null;
    const isToday = selectedDate === getLocalDateString();

    // First, check if there's a manually entered weight in our database for the selected date
    // This takes priority over health integration data
    try {
      const dateEntry = await getWeightEntryByDate(selectedDate);
      if (dateEntry && dateEntry.weight_value != null) {
        existingEntry = dateEntry;
        setWeightNotes(dateEntry.notes || '');
        setTodayWeight(dateEntry);
      }
    } catch (error) {
      console.error('Error checking weight entry:', error);
    }

    // If user has manually entered weight, use that (priority over health integration)
    if (existingEntry) {
      let displayWeight = parseFloat(existingEntry.weight_value);
      if (!isNaN(displayWeight) && displayWeight > 0) {
        if (profile.weightUnit === 'lbs' && existingEntry.weight_unit === 'kg') {
          displayWeight = displayWeight * 2.20462;
        } else if (profile.weightUnit === 'kg' && existingEntry.weight_unit === 'lbs') {
          displayWeight = displayWeight / 2.20462;
        }
        setWeightEntry(String(Math.round(displayWeight * 10) / 10));
      }
      navigateTo('addWeight');
      return;
    }

    // No manual entry exists, try to get weight from health integration for the selected date
    try {
      const healthWeight = isToday
        ? await getLocalWeight()
        : await getLocalWeightByDate(selectedDate);

      if (healthWeight && healthWeight.weight && healthWeight.weight > 0) {
        // Health data is in kg, convert if user prefers lbs
        let displayWeight = healthWeight.weight;
        if (profile.weightUnit === 'lbs') {
          displayWeight = displayWeight * 2.20462;
        }
        weightFromHealth = Math.round(displayWeight * 10) / 10;
        setWeightEntry(String(weightFromHealth));
      }
    } catch (error) {
      console.log('Could not get weight from health integration:', error);
    }

    // If no data from either source, weightEntry stays empty (displays as 0)
    navigateTo('addWeight');
  };

  // Handle saving weight entry
  const handleSaveWeight = async () => {
    if (!weightEntry.trim()) {
      Alert.alert('Missing Weight', 'Please enter your weight.');
      return;
    }

    const weightValue = parseFloat(weightEntry);
    if (isNaN(weightValue) || weightValue <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid weight.');
      return;
    }

    setIsSavingWeight(true);
    try {
      // Convert to kg for storage if user uses lbs
      let weightInKg = weightValue;
      if (profile.weightUnit === 'lbs') {
        weightInKg = weightValue * 0.453592;
      }

      await saveWeightEntry({
        date: selectedDate,
        weight: Math.round(weightInKg * 100) / 100,
        unit: 'kg', // Always store in kg
        notes: weightNotes.trim() || null,
      });

      const isToday = selectedDate === getLocalDateString();
      Alert.alert('Success', isToday ? 'Weight logged successfully!' : `Weight logged for ${formatDisplayDate(selectedDate)}!`, [
        { text: 'OK', onPress: resetToHome }
      ]);
    } catch (error) {
      console.error('Error saving weight:', error);
      Alert.alert('Error', 'Failed to save weight. Please try again.');
    } finally {
      setIsSavingWeight(false);
    }
  };

  // Navigate to Reports screen
  const goToReports = () => {
    navigateTo('reports');
  };

  // Navigate to Community screen
  const goToCommunity = () => {
    navigateTo('community');
    loadCommunityPosts();
  };

  // Navigate to Diary screen (uses currently selected date)
  const goToDiary = () => {
    navigateTo('diary');
    loadDiaryEntry(selectedDate);
  };

  // Navigate to Macro vs Weight Progress report
  const goToMacroWeightReport = async () => {
    setIsLoadingReport(true);
    setReportData(null);
    navigateTo('macroWeightReport');
    
    try {
      const data = await getMacroWeightProgressReport(reportDateRange);
      setReportData(data);
    } catch (error) {
      console.error('Error loading report:', error);
      Alert.alert('Error', 'Failed to load report data.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Load report with different date range
  const loadReportWithRange = async (days) => {
    setReportDateRange(days);
    setIsLoadingReport(true);

    try {
      const data = await getMacroWeightProgressReport(days);
      setReportData(data);
    } catch (error) {
      console.error('Error loading report:', error);
      Alert.alert('Error', 'Failed to load report data.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // ==========================================================================
  // HEALTH PROVIDER FUNCTIONS
  // ==========================================================================

  // Load connected health providers
  const loadConnectedProviders = async () => {
    setIsLoadingProviders(true);
    try {
      const providers = await getConnectedProviders();
      setConnectedProviders(providers || []);
    } catch (error) {
      console.error('Error loading connected providers:', error);
      setConnectedProviders([]);
    } finally {
      setIsLoadingProviders(false);
    }
  };

  // Check if a provider is connected
  const isProviderConnected = (providerId) => {
    return connectedProviders.some(p => p.provider_type === providerId);
  };

  // Handle connecting a health provider
  const handleConnectProvider = async (provider) => {
    if (provider.type === 'local') {
      // Handle local providers (Health Connect / HealthKit)
      try {
        const available = await isLocalHealthAvailable(provider.id);
        if (!available) {
          Alert.alert(
            'Not Available',
            `${provider.name} is not available on this device. Please ensure the app is installed and permissions are enabled.`
          );
          return;
        }

        const permResult = await requestLocalHealthPermissions();
        if (permResult.success) {
          // Sync initial data to backend (last 30 days)
          Alert.alert('Syncing...', 'Syncing your health data. This may take a moment.');
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const syncResult = await syncLocalHealthToBackend(startDate, endDate);
          if (syncResult.success) {
            await loadConnectedProviders();
            Alert.alert('Connected!', `Successfully connected to ${provider.name}. Synced ${syncResult.daysSynced || 0} days of data.`);
          } else {
            Alert.alert('Sync Failed', syncResult.error || 'Connected but failed to sync data. Please try again.');
          }
        } else {
          // Offer to open health settings for manual permission grant
          Alert.alert(
            'Permission Required',
            permResult.error || `Please grant ${provider.name} permissions to access your health data.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => openHealthSettings(provider.id)
              }
            ]
          );
        }
      } catch (error) {
        console.error('Local health connection error:', error);
        Alert.alert(
          'Connection Error',
          `Failed to connect: ${error.message || 'Unknown error'}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => openHealthSettings(provider.id)
            }
          ]
        );
      }
    } else {
      // Handle cloud providers (Polar, Oura) via OAuth
      try {
        const result = await initiateOAuth(provider.id);
        if (!result.success) {
          Alert.alert('Connection Failed', result.error || 'Failed to start connection.');
        }
        // OAuth flow will redirect user to browser, then deep link back
      } catch (error) {
        console.error('OAuth initiation error:', error);
        Alert.alert('Error', 'Failed to start connection.');
      }
    }
  };

  // Handle disconnecting a health provider
  const handleDisconnectProvider = async (provider) => {
    Alert.alert(
      'Disconnect Provider',
      `Are you sure you want to disconnect ${provider.name}? Your synced data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await disconnectProvider(provider.id);
              if (success) {
                await loadConnectedProviders();
                Alert.alert('Disconnected', `${provider.name} has been disconnected.`);
              } else {
                Alert.alert('Error', 'Failed to disconnect provider.');
              }
            } catch (error) {
              console.error('Disconnect error:', error);
              Alert.alert('Error', 'Failed to disconnect provider.');
            }
          },
        },
      ]
    );
  };

  // Navigate to Consumption vs Burned report
  const goToConsumptionVsBurnedReport = async () => {
    setIsLoadingReport(true);
    setConsumptionBurnedData(null);
    navigateTo('consumptionVsBurnedReport');

    try {
      // Auto-sync from local health provider if available (get latest data)
      if (isHealthConnectAvailable() || isHealthKitAvailable()) {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - consumptionBurnedDateRange * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        // Sync in background, don't block report loading
        syncLocalHealthToBackend(startDate, endDate).catch(err => {
          console.log('Background sync error (non-fatal):', err);
        });
      }

      const data = await getConsumptionVsBurnedReport(consumptionBurnedDateRange);
      setConsumptionBurnedData(data);
    } catch (error) {
      console.error('Error loading consumption vs burned report:', error);
      Alert.alert('Error', 'Failed to load report data.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Load consumption vs burned report with different date range
  const loadConsumptionBurnedWithRange = async (days) => {
    setConsumptionBurnedDateRange(days);
    setIsLoadingReport(true);

    try {
      // Auto-sync from local health provider if available (get latest data for new range)
      if (isHealthConnectAvailable() || isHealthKitAvailable()) {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        // Sync in background, don't block report loading
        syncLocalHealthToBackend(startDate, endDate).catch(err => {
          console.log('Background sync error (non-fatal):', err);
        });
      }

      const data = await getConsumptionVsBurnedReport(days);
      setConsumptionBurnedData(data);
    } catch (error) {
      console.error('Error loading report:', error);
      Alert.alert('Error', 'Failed to load report data.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Handle selecting a saved meal to add as food entry
  const handleSelectSavedMeal = async (savedMeal) => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    
    setIsSaving(true);
    try {
      const entry = {
        date: selectedDate,
        time: currentTime + ':00',
        mealId: selectedMeal.id,
        description: savedMeal.food_description,
        image: null,
        calories: savedMeal.food_calories || 0,
        carbs: parseFloat(savedMeal.food_carbs) || 0,
        proteins: parseFloat(savedMeal.food_proteins) || 0,
        fats: parseFloat(savedMeal.food_fats) || 0,
        fiber: parseFloat(savedMeal.food_fiber) || 0,
      };

      await saveFoodEntry(entry);
      await loadTodayEntries();

      Alert.alert('Added', 'Food entry added!', [
        { text: 'OK' }
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to add food entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle saving current entry as a favorite
  const handleSaveAsFavorite = async () => {
    if (!manualEntry.description.trim()) {
      Alert.alert('Missing Information', 'Please enter a food description first.');
      return;
    }
    if (!manualEntry.calories) {
      Alert.alert('Missing Information', 'Please enter the calories first.');
      return;
    }

    setIsSaving(true);
    try {
      await saveMealAsFavorite({
        mealId: selectedMeal.id,
        description: manualEntry.description,
        calories: parseInt(manualEntry.calories) || 0,
        carbs: parseFloat(manualEntry.carbs) || 0,
        proteins: parseFloat(manualEntry.proteins) || 0,
        fats: parseFloat(manualEntry.fats) || 0,
        fiber: parseFloat(manualEntry.fiber) || 0,
      });

      Alert.alert('Saved!', `"${manualEntry.description}" has been saved to your ${selectedMeal.name} favorites.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save as favorite. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle saving camera/barcode analysis result as a favorite
  const handleSaveAnalysisAsFavorite = async () => {
    if (!analysisResult) {
      Alert.alert('Error', 'No analysis result to save.');
      return;
    }

    const description = analysisResult.mealDescription || 'Food entry';
    
    setIsSaving(true);
    try {
      await saveMealAsFavorite({
        mealId: selectedMeal.id,
        description: description,
        calories: parseInt(analysisResult.totalCalories) || 0,
        carbs: parseFloat(analysisResult.totalCarbs) || 0,
        proteins: parseFloat(analysisResult.totalProtein) || 0,
        fats: parseFloat(analysisResult.totalFat) || 0,
        fiber: parseFloat(analysisResult.totalFiber) || 0,
      });

      Alert.alert('Saved!', `"${description}" has been saved to your ${selectedMeal.name} favorites.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save as favorite. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle saving edited entry as a favorite
  const handleSaveEditingEntryAsFavorite = async () => {
    if (!editingEntry) {
      Alert.alert('Error', 'No entry to save.');
      return;
    }
    if (!editingEntry.description?.trim()) {
      Alert.alert('Missing Information', 'Please enter a food description first.');
      return;
    }

    const currentMeal = MEAL_TYPES.find(m => m.id === editingEntry.mealId);
    
    setIsSaving(true);
    try {
      await saveMealAsFavorite({
        mealId: editingEntry.mealId,
        description: editingEntry.description,
        calories: parseInt(editingEntry.calories) || 0,
        carbs: parseFloat(editingEntry.carbs) || 0,
        proteins: parseFloat(editingEntry.proteins) || 0,
        fats: parseFloat(editingEntry.fats) || 0,
        fiber: parseFloat(editingEntry.fiber) || 0,
      });

      Alert.alert('Saved!', `"${editingEntry.description}" has been saved to your ${currentMeal?.name || 'meal'} favorites.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to save as favorite. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting a saved meal
  const handleDeleteSavedMeal = async (savedMealId) => {
    Alert.alert(
      'Delete Saved Meal',
      'Are you sure you want to delete this saved meal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedMeal(savedMealId);
              // Refresh the list
              const meals = await getSavedMealsByMealType(selectedMeal.id);
              setSavedMealsForMeal(meals);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete saved meal.');
            }
          },
        },
      ]
    );
  };

  // Handle editing a saved meal - open edit mode
  const handleEditSavedMeal = (meal) => {
    const calories = parseFloat(meal.food_calories) || 0;
    const proteins = parseFloat(meal.food_proteins) || 0;
    const carbs = parseFloat(meal.food_carbs) || 0;
    const fats = parseFloat(meal.food_fats) || 0;
    
    setEditingSavedMeal({
      id: meal.saved_meal_id,
      description: meal.food_description || '',
      calories: String(calories),
      proteins: String(proteins),
      carbs: String(carbs),
      fats: String(fats),
    });
    
    // Store base nutrition for serving calculations
    setBaseSavedMealNutrition({
      calories,
      proteins,
      carbs,
      fats,
    });
    setSavedMealServings('1');
  };

  // Handle saving edited saved meal
  const handleSaveEditedSavedMeal = async () => {
    if (!editingSavedMeal) return;
    
    if (!editingSavedMeal.description?.trim()) {
      Alert.alert('Missing Information', 'Please enter a food description.');
      return;
    }

    setIsSaving(true);
    try {
      await updateSavedMeal(editingSavedMeal.id, {
        description: editingSavedMeal.description,
        calories: parseInt(editingSavedMeal.calories) || 0,
        carbs: parseFloat(editingSavedMeal.carbs) || 0,
        proteins: parseFloat(editingSavedMeal.proteins) || 0,
        fats: parseFloat(editingSavedMeal.fats) || 0,
      });

      // Refresh the list
      const meals = await getSavedMealsByMealType(selectedMeal.id);
      setSavedMealsForMeal(meals);
      
      // Close edit mode and reset servings
      setEditingSavedMeal(null);
      setBaseSavedMealNutrition(null);
      setSavedMealServings('1');
      
      Alert.alert('Success', 'Saved meal updated!');
    } catch (err) {
      Alert.alert('Error', 'Failed to update saved meal. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle canceling edit of saved meal
  const handleCancelEditSavedMeal = () => {
    setEditingSavedMeal(null);
    setBaseSavedMealNutrition(null);
    setSavedMealServings('1');
  };

  // Handle saved meal serving size change
  const handleSavedMealServingsChange = (newServings) => {
    const servingsNum = parseFloat(newServings) || 0;
    setSavedMealServings(newServings);
    
    if (baseSavedMealNutrition && servingsNum > 0) {
      setEditingSavedMeal(prev => ({
        ...prev,
        calories: String(Math.round(baseSavedMealNutrition.calories * servingsNum)),
        proteins: String(Math.round(baseSavedMealNutrition.proteins * servingsNum * 10) / 10),
        carbs: String(Math.round(baseSavedMealNutrition.carbs * servingsNum * 10) / 10),
        fats: String(Math.round(baseSavedMealNutrition.fats * servingsNum * 10) / 10),
      }));
    }
  };

  // Handle saving manual entry
  const handleSaveManualEntry = async () => {
    // Validate required fields
    if (!manualEntry.description.trim()) {
      Alert.alert('Missing Information', 'Please enter a food description.');
      return;
    }
    if (!manualEntry.calories) {
      Alert.alert('Missing Information', 'Please enter the calories.');
      return;
    }

    setIsSaving(true);
    try {
      const entry = {
        date: manualEntry.date,
        time: manualEntry.time + ':00', // Add seconds for database format
        mealId: selectedMeal.id,
        description: manualEntry.description,
        image: null,
        calories: parseInt(manualEntry.calories) || 0,
        carbs: parseFloat(manualEntry.carbs) || 0,
        proteins: parseFloat(manualEntry.proteins) || 0,
        fats: parseFloat(manualEntry.fats) || 0,
        fiber: parseFloat(manualEntry.fiber) || 0,
      };

      await saveFoodEntry(entry);
      await loadTodayEntries();

      Alert.alert('Success', 'Food entry saved!', [
        { text: 'OK', onPress: resetToHome }
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save food entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open edit screen for an entry
  const handleEditEntry = (entry) => {
    const meal = MEAL_TYPES.find(m => m.id === entry.food_entry_meal_id);
    setSelectedMeal(meal);
    
    const calories = parseFloat(entry.food_calories) || 0;
    const proteins = parseFloat(entry.food_proteins) || 0;
    const carbs = parseFloat(entry.food_carbs) || 0;
    const fats = parseFloat(entry.food_fats) || 0;
    const fiber = parseFloat(entry.food_fiber) || 0;

    setEditingEntry({
      id: entry.food_entry_id,
      date: entry.food_entry_date,
      time: entry.food_entry_time?.slice(0, 5) || '', // HH:MM format
      mealId: entry.food_entry_meal_id,
      description: entry.food_description || '',
      calories: String(calories),
      proteins: String(proteins),
      carbs: String(carbs),
      fats: String(fats),
      fiber: String(fiber),
    });

    // Store base nutrition for serving calculations
    setBaseEditEntryNutrition({
      calories,
      proteins,
      carbs,
      fats,
      fiber,
    });
    setEditEntryServings('1');

    navigateTo('edit');
  };

  // Save edited entry
  const handleSaveEditedEntry = async () => {
    if (!editingEntry.description.trim()) {
      Alert.alert('Missing Information', 'Please enter a food description.');
      return;
    }
    if (!editingEntry.calories) {
      Alert.alert('Missing Information', 'Please enter the calories.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedData = {
        date: editingEntry.date,
        time: editingEntry.time.length === 5 ? editingEntry.time + ':00' : editingEntry.time,
        mealId: editingEntry.mealId,
        description: editingEntry.description,
        calories: parseInt(editingEntry.calories) || 0,
        carbs: parseFloat(editingEntry.carbs) || 0,
        proteins: parseFloat(editingEntry.proteins) || 0,
        fats: parseFloat(editingEntry.fats) || 0,
        fiber: parseFloat(editingEntry.fiber) || 0,
      };

      await updateFoodEntry(editingEntry.id, updatedData);
      await loadTodayEntries();

      Alert.alert('Success', 'Entry updated!', [
        { text: 'OK', onPress: () => {
          setEditingEntry(null);
          setBaseEditEntryNutrition(null);
          setEditEntryServings('1');
          goHome();
          setActiveTab('today');
        }}
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to update entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete entry
  const handleDeleteEntry = () => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this food entry? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await deleteFoodEntry(editingEntry.id);
              await loadTodayEntries();
              Alert.alert('Deleted', 'Entry has been deleted.', [
                { text: 'OK', onPress: () => {
                  setEditingEntry(null);
                  setBaseEditEntryNutrition(null);
                  setEditEntryServings('1');
                  goHome();
                  setActiveTab('today');
                }}
              ]);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete entry. Please try again.');
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    );
  };

  // Quick delete entry from list (without going to edit screen)
  const handleQuickDeleteEntry = (entry) => {
    Alert.alert(
      'Delete Entry',
      `Are you sure you want to delete "${entry.food_description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFoodEntry(entry.food_entry_id);
              await loadTodayEntries();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete entry. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingEntry(null);
    setBaseEditEntryNutrition(null);
    setEditEntryServings('1');
    goHome();
    setActiveTab('today');
  };

  // Handle edit entry serving size change
  const handleEditEntryServingsChange = (newServings) => {
    const servingsNum = parseFloat(newServings) || 0;
    setEditEntryServings(newServings);
    
    if (baseEditEntryNutrition && servingsNum > 0) {
      setEditingEntry(prev => ({
        ...prev,
        calories: String(Math.round(baseEditEntryNutrition.calories * servingsNum)),
        proteins: String(Math.round(baseEditEntryNutrition.proteins * servingsNum * 10) / 10),
        carbs: String(Math.round(baseEditEntryNutrition.carbs * servingsNum * 10) / 10),
        fats: String(Math.round(baseEditEntryNutrition.fats * servingsNum * 10) / 10),
      }));
    }
  };

// ============================================================================
  // AUTHENTICATION SCREENS (show these if not logged in)
  // ============================================================================
  
  // Loading state while checking auth
  if (authState === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Image 
              source={require('./assets/icon.png')} 
              style={{ width: 80, height: 80, marginBottom: 20, borderRadius: 16 }}
            />
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={{ color: '#fff', marginTop: 16 }}>Loading...</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Login screen
  if (authState === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onNavigateToRegister={(data) => {
          setRegisterData(data || {});
          setAuthState('register');
        }}
        onNavigateToForgotPassword={() => setAuthState('forgot')}
      />
    );
  }

  // Register screen
  if (authState === 'register') {
    return (
      <RegisterScreen
        initialData={registerData}
        onRegisterSuccess={() => setAuthState('login')}
        onNavigateToLogin={() => setAuthState('login')}
      />
    );
  }

  // Forgot password screen
  if (authState === 'forgot') {
    return (
      <ForgotPasswordScreen
        onNavigateToLogin={() => setAuthState('login')}
      />
    );
  }

  // ============================================================================
  // MAIN APP (only shown when authState === 'authenticated')
  // ============================================================================
  
  // ... your existing code continues here (camera permission check, etc.)

  // Loading/Permission states
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.permissionGradient}>
          <Text style={styles.permissionIcon}>📸</Text>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            SnapPlate needs camera access to analyze your food photos and scan barcodes.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <LinearGradient colors={['#FF6B6B', '#FF8E53']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.permissionButtonGradient}>
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Session Expired Modal - shows over any content when session expires
  const SessionExpiredModal = () => (
    <Modal
      visible={sessionExpired}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.sessionExpiredOverlay}>
        <View style={styles.sessionExpiredModal}>
          <Text style={styles.sessionExpiredIcon}>🔐</Text>
          <Text style={styles.sessionExpiredTitle}>Session Expired</Text>
          <Text style={styles.sessionExpiredMessage}>
            Your session has expired. Please sign in again to continue tracking your nutrition.
          </Text>
          <Text style={styles.sessionExpiredNote}>
            Don't worry - your data is safe and will be available after you sign in.
          </Text>
          <TouchableOpacity 
            style={styles.sessionExpiredButton} 
            onPress={handleSessionExpired}
          >
            <LinearGradient 
              colors={['#FF6B6B', '#FF8E53']} 
              start={{ x: 0, y: 0 }} 
              end={{ x: 1, y: 0 }} 
              style={styles.sessionExpiredButtonGradient}
            >
              <Text style={styles.sessionExpiredButtonText}>Sign In Again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ==========================================================================
  // PROFILE SCREEN
  // ==========================================================================
  if (activeTab === 'profile' && screen === 'main') {
    const targets = getTargets();
    
    if (isLoadingProfile) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />
          <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4ECDC4" />
              <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
          </LinearGradient>
        </SafeAreaView>
      );
    }
    
    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 Profile</Text>
              <Text style={styles.screenSubtitle}>Your goals and targets</Text>
            </View>

            {/* Personal Information */}
            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              
              <View style={styles.nameRow}>
                <View style={styles.nameInputGroup}>
                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={profile.firstName}
                    onChangeText={(val) => setProfile({ ...profile, firstName: val })}
                    placeholder="John"
                    placeholderTextColor="#666"
                    editable={isEditingProfile}
                  />
                </View>
                
                <View style={styles.nameInputGroup}>
                  <Text style={styles.inputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={profile.lastName}
                    onChangeText={(val) => setProfile({ ...profile, lastName: val })}
                    placeholder="Doe"
                    placeholderTextColor="#666"
                    editable={isEditingProfile}
                  />
                </View>
              </View>
              
              <View style={styles.nameRow}>
                <View style={styles.ageInputGroup}>
                  <Text style={styles.inputLabel}>Age</Text>
                  <TextInput
                    style={styles.input}
                    value={profile.age}
                    onChangeText={(val) => setProfile({ ...profile, age: val })}
                    placeholder="30"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    editable={isEditingProfile}
                  />
                </View>
                
                <View style={styles.heightInputGroup}>
                  <Text style={styles.inputLabel}>Height</Text>
                  <View style={styles.weightInputRow}>
                    <TextInput
                      style={[styles.input, styles.heightInput]}
                      value={profile.height}
                      onChangeText={(val) => setProfile({ ...profile, height: val })}
                      placeholder={profile.heightUnit === 'cm' ? '175' : '69'}
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      editable={isEditingProfile}
                    />
                    <View style={styles.unitToggleContainer}>
                      <TouchableOpacity
                        style={[
                          styles.unitToggleButton,
                          profile.heightUnit === 'cm' && styles.unitToggleButtonActive
                        ]}
                        onPress={() => isEditingProfile && setProfile({ ...profile, heightUnit: 'cm' })}
                        disabled={!isEditingProfile}
                      >
                        <Text style={[
                          styles.unitToggleText,
                          profile.heightUnit === 'cm' && styles.unitToggleTextActive
                        ]}>cm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.unitToggleButton,
                          profile.heightUnit === 'in' && styles.unitToggleButtonActive
                        ]}
                        onPress={() => isEditingProfile && setProfile({ ...profile, heightUnit: 'in' })}
                        disabled={!isEditingProfile}
                      >
                        <Text style={[
                          styles.unitToggleText,
                          profile.heightUnit === 'in' && styles.unitToggleTextActive
                        ]}>in</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Goal Settings</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Goal Weight</Text>
                <View style={styles.weightInputRow}>
                  <TextInput
                    style={[styles.input, styles.weightInput]}
                    value={profile.goalWeight}
                    onChangeText={(val) => setProfile({ ...profile, goalWeight: val })}
                    placeholder={profile.weightUnit === 'kg' ? 'e.g., 70' : 'e.g., 154'}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    editable={isEditingProfile}
                  />
                  <View style={styles.unitToggleContainer}>
                    <TouchableOpacity
                      style={[
                        styles.unitToggleButton,
                        profile.weightUnit === 'kg' && styles.unitToggleButtonActive
                      ]}
                      onPress={() => isEditingProfile && setProfile({ ...profile, weightUnit: 'kg' })}
                      disabled={!isEditingProfile}
                    >
                      <Text style={[
                        styles.unitToggleText,
                        profile.weightUnit === 'kg' && styles.unitToggleTextActive
                      ]}>kg</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.unitToggleButton,
                        profile.weightUnit === 'lbs' && styles.unitToggleButtonActive
                      ]}
                      onPress={() => isEditingProfile && setProfile({ ...profile, weightUnit: 'lbs' })}
                      disabled={!isEditingProfile}
                    >
                      <Text style={[
                        styles.unitToggleText,
                        profile.weightUnit === 'lbs' && styles.unitToggleTextActive
                      ]}>lbs</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Goal Date</Text>
                <TextInput
                  style={styles.input}
                  value={profile.goalDate}
                  onChangeText={(val) => setProfile({ ...profile, goalDate: val })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#666"
                  editable={isEditingProfile}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Calories (per day)</Text>
                <TextInput
                  style={styles.input}
                  value={profile.targetCalories}
                  onChangeText={(val) => setProfile({ ...profile, targetCalories: val })}
                  placeholder="e.g., 2000"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  editable={isEditingProfile}
                />
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Macro Distribution</Text>
              <Text style={styles.macroHint}>Percentages must add up to 100%</Text>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputGroup}>
                  <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>Carbs %</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={profile.carbsPercent}
                    onChangeText={(val) => setProfile({ ...profile, carbsPercent: val })}
                    placeholder="50"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    editable={isEditingProfile}
                  />
                </View>
                <View style={styles.macroInputGroup}>
                  <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>Protein %</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={profile.proteinsPercent}
                    onChangeText={(val) => setProfile({ ...profile, proteinsPercent: val })}
                    placeholder="25"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    editable={isEditingProfile}
                  />
                </View>
                <View style={styles.macroInputGroup}>
                  <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>Fat %</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={profile.fatsPercent}
                    onChangeText={(val) => setProfile({ ...profile, fatsPercent: val })}
                    placeholder="25"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    editable={isEditingProfile}
                  />
                </View>
              </View>

              <View style={styles.macroTotalRow}>
                <Text style={styles.macroTotalLabel}>Total:</Text>
                <Text style={[
                  styles.macroTotalValue,
                  { color: (parseInt(profile.carbsPercent || 0) + parseInt(profile.proteinsPercent || 0) + parseInt(profile.fatsPercent || 0)) === 100 ? '#4ECDC4' : '#FF6B6B' }
                ]}>
                  {parseInt(profile.carbsPercent || 0) + parseInt(profile.proteinsPercent || 0) + parseInt(profile.fatsPercent || 0)}%
                </Text>
              </View>
            </View>

            {/* Calculated Targets */}
            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Daily Targets (grams)</Text>
              <View style={styles.targetDisplay}>
                <View style={styles.targetItem}>
                  <Text style={styles.targetValue}>{targets.calories}</Text>
                  <Text style={styles.targetLabel}>kcal</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: '#4ECDC4' }]}>{targets.carbs}g</Text>
                  <Text style={styles.targetLabel}>Carbs</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: '#FF6B6B' }]}>{targets.proteins}g</Text>
                  <Text style={styles.targetLabel}>Protein</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: '#FFE66D' }]}>{targets.fats}g</Text>
                  <Text style={styles.targetLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {/* Edit/Save Button */}
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => isEditingProfile ? handleSaveProfile() : setIsEditingProfile(true)}
              disabled={isSaving}
            >
              <LinearGradient
                colors={isEditingProfile ? ['#4ECDC4', '#2ECC71'] : ['#FF6B6B', '#FF8E53']}
                style={styles.profileButtonGradient}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.profileButtonText}>
                    {isEditingProfile ? '💾 Save Profile' : '✏️ Edit Profile'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Health Integrations Section */}
            <View style={styles.healthIntegrationsSection}>
              <Text style={styles.healthIntegrationsTitle}>Health Integrations</Text>
              <Text style={styles.healthIntegrationsSubtitle}>
                Connect your fitness tracker to see calories burned
              </Text>

              {isLoadingProviders ? (
                <ActivityIndicator size="small" color="#4ECDC4" style={{ marginVertical: 20 }} />
              ) : (
                <View style={styles.healthProvidersList}>
                  {availableProviders
                    .filter((provider) => provider.id !== 'oura') // Hide Oura until app ID is ready
                    .map((provider) => {
                    const connected = isProviderConnected(provider.id);
                    return (
                      <View key={provider.id} style={styles.healthProviderCard}>
                        <View style={[styles.healthProviderIcon, { backgroundColor: provider.color + '30' }]}>
                          <Text style={styles.healthProviderEmoji}>{provider.icon}</Text>
                        </View>
                        <View style={styles.healthProviderInfo}>
                          <Text style={styles.healthProviderName}>{provider.name}</Text>
                          <Text style={styles.healthProviderDescription}>{provider.description}</Text>
                        </View>
                        {connected ? (
                          <TouchableOpacity
                            style={styles.healthProviderDisconnectBtn}
                            onPress={() => handleDisconnectProvider(provider)}
                          >
                            <Text style={styles.healthProviderDisconnectText}>Disconnect</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.healthProviderConnectBtn, { backgroundColor: provider.color }]}
                            onPress={() => handleConnectProvider(provider)}
                          >
                            <Text style={styles.healthProviderConnectText}>Connect</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>🚪 Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // TODAY SCREEN
  // ==========================================================================
  if (activeTab === 'today' && screen === 'main') {
    const targets = getTargets();
    
    const getProgress = (consumed, target) => {
      if (!target) return 0;
      return Math.round((consumed / target) * 100);
    };

    const getProgressColor = (progress) => {
      if (progress < 80) return '#4ECDC4';
      if (progress <= 100) return '#2ECC71';
      return '#FF6B6B';
    };

    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B6B" />
            }
          >
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>📊 Daily Progress</Text>
            </View>

            {/* Date Navigation */}
            <View style={styles.dateNavContainer}>
              <TouchableOpacity style={styles.dateNavButton} onPress={goToPreviousDay}>
                <Text style={styles.dateNavButtonText}>◀</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.dateNavCenter} onPress={goToToday}>
                <Text style={styles.dateNavDateText}>{formatDisplayDate(selectedDate)}</Text>
                <Text style={styles.dateNavFullDate}>
                  {parseLocalDate(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
                {!isToday && (
                  <Text style={styles.goToTodayHint}>Tap to go to today</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.dateNavButton, isFutureDate && styles.dateNavButtonDisabled]} 
                onPress={goToNextDay}
                disabled={isFutureDate}
              >
                <Text style={[styles.dateNavButtonText, isFutureDate && styles.dateNavButtonTextDisabled]}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Calories Progress */}
            <View style={styles.caloriesCard}>
              <View style={styles.caloriesHeader}>
                <Text style={styles.caloriesTitle}>🔥 Calories</Text>
                <Text style={styles.caloriesRemaining}>
                  {isToday 
                    ? `${Math.max(targets.calories - todayTotals.calories, 0)} remaining`
                    : `${todayTotals.calories > targets.calories ? '+' : ''}${todayTotals.calories - targets.calories} vs target`
                  }
                </Text>
              </View>
              <View style={styles.caloriesProgress}>
                <Text style={styles.caloriesConsumed}>{Math.round(todayTotals.calories)}</Text>
                <Text style={styles.caloriesTarget}>/ {targets.calories} kcal</Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${Math.min(getProgress(todayTotals.calories, targets.calories), 100)}%`,
                      backgroundColor: getProgressColor(getProgress(todayTotals.calories, targets.calories))
                    }
                  ]} 
                />
              </View>
            </View>

            {/* Macros Progress */}
            <View style={styles.macrosProgressContainer}>
              {[
                { label: 'Carbs', consumed: todayTotals.carbs, target: targets.carbs, color: '#FFE66D', icon: '🍞' },
                { label: 'Net', consumed: calculateNetCarbs(todayTotals.carbs, todayTotals.fiber), target: Math.max(0, targets.carbs - Math.round(targets.carbs * 0.15)), color: '#4ECDC4', icon: '⚡' },
                { label: 'Fiber', consumed: todayTotals.fiber, target: Math.round(targets.carbs * 0.15), color: '#8E44AD', icon: '🥬' },
                { label: 'Prot', consumed: todayTotals.proteins, target: targets.proteins, color: '#FF6B6B', icon: '💪' },
                { label: 'Fat', consumed: todayTotals.fats, target: targets.fats, color: '#A78BFA', icon: '🥑' },
              ].map((macro, index) => (
                <View key={index} style={styles.macroProgressCard}>
                  <Text style={styles.macroProgressIcon}>{macro.icon}</Text>
                  <Text style={styles.macroProgressLabel} numberOfLines={1}>{macro.label}</Text>
                  <Text style={[styles.macroProgressValue, { color: macro.color }]} numberOfLines={1}>
                    {Math.round(macro.consumed)}g
                  </Text>
                  <Text style={styles.macroProgressTarget} numberOfLines={1}>/ {macro.target}g</Text>
                  <View style={[styles.macroProgressBar, { backgroundColor: macro.color + '30' }]}>
                    <View
                      style={[
                        styles.macroProgressFill,
                        {
                          width: `${Math.min(getProgress(macro.consumed, macro.target), 100)}%`,
                          backgroundColor: macro.color
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.macroProgressPercent} numberOfLines={1}>
                    {getProgress(macro.consumed, macro.target)}%
                  </Text>
                </View>
              ))}
            </View>

            {/* Today's Entries */}
            <View style={styles.todayEntriesSection}>
              <Text style={styles.sectionTitle}>
                {isToday ? "Today's Entries" : "Entries"} ({todayEntries.length})
              </Text>
              
              {isLoadingEntries ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color="#4ECDC4" />
                  <Text style={styles.emptyStateText}>Loading entries...</Text>
                </View>
              ) : todayEntries.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateIcon}>🍽️</Text>
                  <Text style={styles.emptyStateText}>
                    {isToday ? 'No entries yet today' : 'No entries for this day'}
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    {isToday ? 'Start tracking your meals!' : 'Use the arrows to navigate to other days'}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.editHint}>Tap an entry to edit</Text>
                  {todayEntries.map((entry, index) => {
                    const meal = MEAL_TYPES.find(m => m.id === entry.food_entry_meal_id);
                    return (
                      <View key={entry.food_entry_id} style={styles.entryCardContainer}>
                        <TouchableOpacity 
                          style={styles.entryCardMain}
                          onPress={() => handleEditEntry(entry)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.entryHeader}>
                            <View style={styles.entryMealBadge}>
                              <Text style={styles.entryMealIcon}>{meal?.icon || '🍽️'}</Text>
                              <Text style={styles.entryMealName}>{meal?.name || 'Meal'}</Text>
                            </View>
                            <Text style={styles.entryTime}>{entry.food_entry_time?.slice(0, 5)}</Text>
                          </View>
                          <Text style={styles.entryDescription} numberOfLines={2}>
                            {entry.food_description}
                          </Text>
                          <View style={styles.entryMacros}>
                            <Text style={styles.entryMacro}>{entry.food_calories} kcal</Text>
                            <Text style={[styles.entryMacro, { color: '#FFE66D' }]}>{entry.food_carbs}g C</Text>
                            <Text style={[styles.entryMacro, { color: '#4ECDC4' }]}>{calculateNetCarbs(entry.food_carbs, entry.food_fiber)}g NC</Text>
                            <Text style={[styles.entryMacro, { color: '#8E44AD' }]}>{entry.food_fiber || 0}g Fib</Text>
                            <Text style={[styles.entryMacro, { color: '#FF6B6B' }]}>{entry.food_proteins}g P</Text>
                            <Text style={[styles.entryMacro, { color: '#A78BFA' }]}>{entry.food_fats}g F</Text>
                          </View>
                        </TouchableOpacity>
                        <View style={styles.entryActions}>
                          <TouchableOpacity
                            style={styles.entryEditButton}
                            onPress={() => handleEditEntry(entry)}
                          >
                            <Text style={styles.entryEditText}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.entryDeleteButton}
                            onPress={() => handleQuickDeleteEntry(entry)}
                          >
                            <Text style={styles.entryDeleteText}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Handler for meal selection - navigates to mode selection screen
  const handleMealSelect = (meal) => {
    setSelectedMeal(meal);
    navigateTo('mealModeSelect');
  };

  // ==========================================================================
  // HOME SCREEN (Compact - No Scrolling)
  // ==========================================================================
  if (activeTab === 'home' && screen === 'main') {
    const isSelectedDateToday = selectedDate === getLocalDateString();

    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.homeContentNoScroll}>
            {/* Compact Header */}
            <View style={styles.homeHeaderCompact}>
              <Text style={styles.homeTitleCompact}>SnapPlate</Text>
              <Text style={styles.homeSubtitleCompact}>AI-Powered Nutrition Tracking</Text>
            </View>

            {/* Compact Date Navigation */}
            <View style={styles.dateNavContainerCompact}>
              <TouchableOpacity style={styles.dateNavButtonCompact} onPress={goToPreviousDay}>
                <Text style={styles.dateNavButtonText}>◀</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dateNavCenterCompact} onPress={goToToday}>
                <Text style={styles.dateNavDateTextCompact}>{formatDisplayDate(selectedDate)}</Text>
                <Text style={styles.dateNavFullDateCompact}>
                  {parseLocalDate(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dateNavButtonCompact, isFutureDate && styles.dateNavButtonDisabled]}
                onPress={goToNextDay}
                disabled={isFutureDate}
              >
                <Text style={[styles.dateNavButtonText, isFutureDate && styles.dateNavButtonTextDisabled]}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Compact Quick Stats */}
            <View style={styles.quickStatsCompact}>
              <Text style={styles.quickStatsTitleCompact}>
                {isSelectedDateToday ? "Today's Progress" : formatDisplayDate(selectedDate)}
              </Text>
              {isLoadingEntries ? (
                <View style={styles.quickStatsRowCompact}>
                  <ActivityIndicator size="small" color="#FF6B6B" />
                </View>
              ) : (
                <View style={styles.quickStatsRowCompact}>
                  <Text style={styles.quickStatsValueCompact}>{Math.round(todayTotals.calories)}</Text>
                  <Text style={styles.quickStatsLabelCompact}>
                    / {profile.targetCalories || 2000} kcal
                  </Text>
                </View>
              )}
              {/* Mini macro breakdown */}
              <View style={styles.quickStatsMacrosCompact}>
                <Text style={[styles.quickStatsMacroCompact, { color: '#FFE66D' }]}>
                  {Math.round(todayTotals.carbs)}g C
                </Text>
                <Text style={[styles.quickStatsMacroCompact, { color: '#4ECDC4' }]}>
                  {calculateNetCarbs(todayTotals.carbs, todayTotals.fiber)}g NC
                </Text>
                <Text style={[styles.quickStatsMacroCompact, { color: '#8E44AD' }]}>
                  {Math.round(todayTotals.fiber)}g Fib
                </Text>
                <Text style={[styles.quickStatsMacroCompact, { color: '#FF6B6B' }]}>
                  {Math.round(todayTotals.proteins)}g P
                </Text>
                <Text style={[styles.quickStatsMacroCompact, { color: '#A78BFA' }]}>
                  {Math.round(todayTotals.fats)}g F
                </Text>
              </View>
            </View>

            {/* Meal Selector - 2x2 Grid */}
            <View style={styles.mealSelectorLargeWrapper}>
              <Text style={styles.mealSelectorPrompt}>Select a meal to add food:</Text>
              <View style={styles.mealGrid2x2}>
                {MEAL_TYPES.map(meal => (
                  <TouchableOpacity
                    key={meal.id}
                    style={styles.mealOptionLarge}
                    onPress={() => handleMealSelect(meal)}
                  >
                    <LinearGradient
                      colors={[meal.color, meal.color + 'AA']}
                      style={styles.mealOptionGradientLarge}
                    >
                      <Text style={styles.mealOptionIconLarge}>{meal.icon}</Text>
                      <Text style={styles.mealOptionNameLarge}>{meal.name}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Divider */}
            <View style={styles.actionButtonsDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Actions</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Action Buttons - 2x2 Grid */}
            <View style={styles.actionButtonsGrid}>
              {/* Add Weight Button */}
              <TouchableOpacity
                style={styles.actionButtonHalf}
                onPress={goToAddWeight}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#3498DB', '#2980B9']}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionButtonIcon}>⚖️</Text>
                  <Text style={styles.actionButtonText}>Add Weight</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* View Reports Button */}
              <TouchableOpacity
                style={styles.actionButtonHalf}
                onPress={goToReports}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#9B59B6', '#8E44AD']}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionButtonIcon}>📈</Text>
                  <Text style={styles.actionButtonText}>View Reports</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Community Button */}
              <TouchableOpacity
                style={styles.actionButtonHalf}
                onPress={goToCommunity}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#E74C3C', '#C0392B']}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionButtonIcon}>👥</Text>
                  <Text style={styles.actionButtonText}>Community</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Diary Button */}
              <TouchableOpacity
                style={styles.actionButtonHalf}
                onPress={goToDiary}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#27AE60', '#1E8449']}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionButtonIcon}>📔</Text>
                  <Text style={styles.actionButtonText}>Diary</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // MEAL MODE SELECTION SCREEN
  // ==========================================================================
  if (screen === 'mealModeSelect' && selectedMeal) {
    const isSelectedDateToday = selectedDate === getLocalDateString();

    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle}>{selectedMeal.icon} {selectedMeal.name}</Text>
            <Text style={styles.screenSubtitle}>
              {isSelectedDateToday ? 'Today' : formatDisplayDate(selectedDate)}
            </Text>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.modeSelectContent}>
            <Text style={styles.modeButtonsTitle}>How would you like to add food?</Text>
            <ModeButton
              icon="📸"
              title="Take a Photo"
              subtitle="Snap your plate for instant AI analysis"
              onPress={goToCamera}
              color="#FF6B6B"
              delay={0}
            />
            <ModeButton
              icon="📊"
              title="Scan Barcode"
              subtitle="Scan packaged food for nutrition facts"
              onPress={goToBarcode}
              color="#4ECDC4"
              delay={100}
            />
            <ModeButton
              icon="🔍"
              title="Search Food"
              subtitle="Look up food in our database"
              onPress={goToFoodSearch}
              color="#9B59B6"
              delay={200}
            />
            <ModeButton
              icon="✏️"
              title="Manual Entry"
              subtitle="Enter nutrition details manually"
              onPress={goToManualEntry}
              color="#3498DB"
              delay={300}
            />
            <ModeButton
              icon="⭐"
              title="From Saved"
              subtitle="Add from your saved favorites"
              onPress={goToSavedMeals}
              color="#F39C12"
              delay={400}
            />
          </ScrollView>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // FOOD SEARCH SCREEN
  // ==========================================================================
  if (screen === 'foodSearch') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.screenHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>🔍 Search Food</Text>
            <Text style={styles.screenSubtitle}>
              {selectedMeal?.icon} {selectedMeal?.name}
            </Text>
          </View>
          <View style={styles.searchContainer}>
            <View style={styles.searchInputRow}>
              <TextInput
                style={styles.searchInput}
                value={foodSearchQuery}
                onChangeText={setFoodSearchQuery}
                placeholder="Search for a food (e.g., chicken breast, apple)"
                placeholderTextColor="#666"
                onSubmitEditing={handleFoodSearch}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleFoodSearch}
                disabled={isSearchingFood || !foodSearchQuery.trim()}
              >
                {isSearchingFood ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.searchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.manualEntryLink}
              onPress={goToManualEntry}
            >
              <Text style={styles.manualEntryLinkText}>
                Or enter food details manually →
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.searchResultsContainer}>
            {isSearchingFood ? (
              <View style={styles.searchingContainer}>
                <ActivityIndicator size="large" color="#9B59B6" />
                <Text style={styles.searchingText}>Searching foods...</Text>
              </View>
            ) : foodSearchResults.length > 0 ? (
              <>
                <Text style={styles.searchResultsTitle}>
                  {foodSearchResults.length} result{foodSearchResults.length !== 1 ? 's' : ''} found
                </Text>
                {foodSearchResults.map((food, index) => (
                  <TouchableOpacity
                    key={food.id || index}
                    style={styles.foodResultCard}
                    onPress={() => handleSelectFood(food)}
                  >
                    <View style={styles.foodResultHeader}>
                      <Text style={styles.foodResultName} numberOfLines={2}>
                        {food.name}
                      </Text>
                      {food.brandName && (
                        <Text style={styles.foodResultBrand}>{food.brandName}</Text>
                      )}
                    </View>
                    <Text style={styles.foodResultServing}>
                      {food.servingDescription || 'Per serving'}
                    </Text>
                    <View style={styles.foodResultMacros}>
                      <Text style={styles.foodResultMacro}>
                        🔥 {Math.round(food.calories || 0)} kcal
                      </Text>
                      <Text style={[styles.foodResultMacro, { color: '#FFE66D' }]}>
                        🍞 {Math.round((food.carbs || 0) * 10) / 10}g C
                      </Text>
                      <Text style={[styles.foodResultMacro, { color: '#4ECDC4' }]}>
                        ⚡ {calculateNetCarbs(food.carbs, food.fiber)}g NC
                      </Text>
                      <Text style={[styles.foodResultMacro, { color: '#8E44AD' }]}>
                        🥬 {Math.round((food.fiber || 0) * 10) / 10}g
                      </Text>
                      <Text style={[styles.foodResultMacro, { color: '#FF6B6B' }]}>
                        💪 {Math.round((food.protein || 0) * 10) / 10}g
                      </Text>
                      <Text style={[styles.foodResultMacro, { color: '#A78BFA' }]}>
                        🥑 {Math.round((food.fat || 0) * 10) / 10}g
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 100 }} />
              </>
            ) : foodSearchQuery && !isSearchingFood ? (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsIcon}>🍽️</Text>
                <Text style={styles.noResultsText}>No foods found</Text>
                <Text style={styles.noResultsSubtext}>
                  Try a different search term or enter the food manually
                </Text>
                <TouchableOpacity
                  style={styles.manualEntryButton}
                  onPress={goToManualEntry}
                >
                  <Text style={styles.manualEntryButtonText}>Enter Manually</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.searchPromptContainer}>
                <Text style={styles.searchPromptIcon}>🔍</Text>
                <Text style={styles.searchPromptText}>
                  Search for foods by name
                </Text>
                <Text style={styles.searchPromptSubtext}>
                  Examples: "grilled chicken", "banana", "greek yogurt"
                </Text>
              </View>
            )}
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // SAVED MEALS SCREEN
  // ==========================================================================
  // ==========================================================================
  // ADD WEIGHT SCREEN
  // ==========================================================================
  if (screen === 'addWeight') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
                <Text style={styles.backButtonText}>← Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.screenTitle}>⚖️ Log Weight</Text>
              <Text style={styles.screenSubtitle}>
                {getLocalDateString() === selectedDate ? 'Today' : formatDisplayDate(selectedDate)}
              </Text>
            </View>

            {/* Weight Input Section */}
            <View style={styles.weightEntrySection}>
              <Text style={styles.sectionTitle}>Enter Your Weight</Text>
              
              {todayWeight && (
                <View style={styles.existingWeightBanner}>
                  <Text style={styles.existingWeightText}>
                    📝 You've already logged weight for this day. Saving will update your entry.
                  </Text>
                </View>
              )}

              <View style={styles.weightInputContainer}>
                <TextInput
                  style={styles.weightEntryInput}
                  value={weightEntry}
                  onChangeText={setWeightEntry}
                  placeholder={profile.weightUnit === 'kg' ? 'e.g., 75.5' : 'e.g., 165.5'}
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <View style={styles.weightUnitDisplay}>
                  <Text style={styles.weightUnitText}>{profile.weightUnit}</Text>
                </View>
              </View>

              <Text style={styles.weightUnitHint}>
                Unit based on your profile settings. Change in Profile → Goal Weight.
              </Text>

              {/* Optional Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={weightNotes}
                  onChangeText={setWeightNotes}
                  placeholder="e.g., After morning workout, before breakfast..."
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Goal Weight Reference */}
              {profile.goalWeight && (
                <View style={styles.goalWeightReference}>
                  <Text style={styles.goalWeightTitle}>🎯 Your Goal</Text>
                  <Text style={styles.goalWeightValue}>
                    {profile.goalWeight} {profile.weightUnit}
                  </Text>
                  {weightEntry && !isNaN(parseFloat(weightEntry)) && (
                    <Text style={styles.goalWeightDiff}>
                      {parseFloat(weightEntry) > parseFloat(profile.goalWeight) 
                        ? `${(parseFloat(weightEntry) - parseFloat(profile.goalWeight)).toFixed(1)} ${profile.weightUnit} to go`
                        : parseFloat(weightEntry) < parseFloat(profile.goalWeight)
                        ? `${(parseFloat(profile.goalWeight) - parseFloat(weightEntry)).toFixed(1)} ${profile.weightUnit} below goal! 🎉`
                        : 'You reached your goal! 🎉'
                      }
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Spacer for bottom buttons */}
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom Action Buttons */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.bottomButton, styles.bottomButtonSecondary]}
              onPress={resetToHome}
            >
              <Text style={styles.bottomButtonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={handleSaveWeight}
              disabled={isSavingWeight || !weightEntry.trim()}
            >
              <LinearGradient 
                colors={isSavingWeight || !weightEntry.trim() ? ['#666', '#555'] : ['#3498DB', '#2980B9']} 
                style={styles.bottomButtonGradient}
              >
                {isSavingWeight ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bottomButtonText}>
                    {todayWeight ? '💾 Update Weight' : '💾 Save Weight'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // COMMUNITY SCREEN
  // ==========================================================================
  if (screen === 'community') {
    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.screenHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>👥 Community</Text>
            <Text style={styles.screenSubtitle}>Share your journey with others</Text>
          </View>

          {/* Posts List */}
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {isLoadingCommunity ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4ECDC4" />
                <Text style={styles.loadingText}>Loading posts...</Text>
              </View>
            ) : communityPosts.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>📝</Text>
                <Text style={styles.emptyStateTitle}>No posts yet</Text>
                <Text style={styles.emptyStateText}>Be the first to share something with the community!</Text>
              </View>
            ) : (
              communityPosts.map(post => (
                <TouchableOpacity
                  key={post.post_id}
                  style={styles.communityPostCard}
                  onPress={() => {
                    setViewingPost(post);
                    loadPostComments(post.post_id);
                    navigateTo('viewPost');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.postHeader}>
                    <View style={styles.postAuthorInfo}>
                      <View style={styles.postAvatar}>
                        <Text style={styles.postAvatarText}>
                          {(post.customer_first_name?.[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.postAuthorName}>
                          {post.customer_first_name || 'Anonymous'} {post.customer_last_name?.[0] || ''}.
                        </Text>
                        <Text style={styles.postTimestamp}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    {/* Edit/Delete buttons for post owner */}
                    {String(post.customer_id) === String(profile.customerId) && (
                      <View style={styles.postOwnerActions}>
                        <TouchableOpacity
                          style={styles.postOwnerActionButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleStartEditPost(post);
                          }}
                        >
                          <Text style={styles.postOwnerActionIcon}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.postOwnerActionButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeletePost(post.post_id);
                          }}
                        >
                          <Text style={styles.postOwnerActionIcon}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <Text style={styles.postContent} numberOfLines={4}>
                    {post.post_content}
                  </Text>

                  {post.post_image && (
                    <Image
                      source={{ uri: post.post_image.startsWith('data:') ? post.post_image : `data:image/jpeg;base64,${post.post_image}` }}
                      style={styles.postImage}
                      resizeMode="contain"
                    />
                  )}

                  <View style={styles.postActions}>
                    <TouchableOpacity
                      style={styles.postActionButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleToggleLike(post);
                      }}
                    >
                      <Text style={styles.postActionIcon}>{post.is_liked_by_me ? '❤️' : '🤍'}</Text>
                      <Text style={styles.postActionText}>{post.likes_count}</Text>
                    </TouchableOpacity>
                    <View style={styles.postActionButton}>
                      <Text style={styles.postActionIcon}>💬</Text>
                      <Text style={styles.postActionText}>{post.comments_count}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Create Post FAB */}
          <TouchableOpacity
            style={styles.fabButton}
            onPress={() => {
              setNewPostContent('');
              setNewPostImage(null);
              navigateTo('createPost');
            }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#E74C3C', '#C0392B']}
              style={styles.fabGradient}
            >
              <Text style={styles.fabIcon}>✏️</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // CREATE POST SCREEN
  // ==========================================================================
  if (screen === 'createPost') {
    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>✏️ New Post</Text>
              <Text style={styles.screenSubtitle}>Share with the community</Text>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={true}
            >
              {/* Content Input */}
              <TextInput
                style={styles.postContentInput}
                placeholder="What's on your mind? Share your thoughts, progress, or photos..."
                placeholderTextColor="#a0a0a0"
                value={newPostContent}
                onChangeText={setNewPostContent}
                multiline
                textAlignVertical="top"
              />

              {/* Image Preview */}
              {newPostImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: newPostImage.startsWith('data:') ? newPostImage : `data:image/jpeg;base64,${newPostImage}` }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setNewPostImage(null)}
                  >
                    <Text style={styles.removeImageButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Add Photo Button */}
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={async () => {
                  // Request permission and pick image from library
                  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!permissionResult.granted) {
                    Alert.alert('Permission Required', 'Please allow access to your photo library to add photos.');
                    return;
                  }

                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    exif: false,
                  });

                  if (!result.canceled && result.assets && result.assets[0]) {
                    const asset = result.assets[0];
                    try {
                      // Resize to max 800px on longest side while maintaining aspect ratio
                      const maxSize = 800;
                      const width = asset.width || 800;
                      const height = asset.height || 800;

                      let resizeConfig = {};
                      if (width > height && width > maxSize) {
                        resizeConfig = { width: maxSize };
                      } else if (height > maxSize) {
                        resizeConfig = { height: maxSize };
                      }

                      const actions = Object.keys(resizeConfig).length > 0 ? [{ resize: resizeConfig }] : [];

                      const processed = await ImageManipulator.manipulateAsync(
                        asset.uri,
                        actions,
                        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                      );
                      setNewPostImage(processed.base64);
                    } catch (error) {
                      console.error('Image processing error:', error);
                      Alert.alert('Error', 'Failed to process image. Please try again.');
                    }
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.addPhotoButtonIcon}>🖼️</Text>
                <Text style={styles.addPhotoButtonText}>Add Photo</Text>
              </TouchableOpacity>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.postSubmitButton, !newPostContent.trim() && styles.postSubmitButtonDisabled]}
                onPress={handleCreatePost}
                disabled={!newPostContent.trim() || isLoadingCommunity}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={newPostContent.trim() ? ['#E74C3C', '#C0392B'] : ['#555', '#444']}
                  style={styles.postSubmitButtonGradient}
                >
                  {isLoadingCommunity ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.postSubmitButtonText}>Post</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // EDIT POST SCREEN
  // ==========================================================================
  if (screen === 'editPost') {
    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>✏️ Edit Post</Text>
              <Text style={styles.screenSubtitle}>Update your post</Text>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={true}
            >
              {/* Content Input */}
              <TextInput
                style={styles.postContentInput}
                placeholder="What's on your mind?"
                placeholderTextColor="#a0a0a0"
                value={editPostContent}
                onChangeText={setEditPostContent}
                multiline
                textAlignVertical="top"
              />

              {/* Image Preview */}
              {editPostImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: editPostImage.startsWith('data:') ? editPostImage : `data:image/jpeg;base64,${editPostImage}` }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setEditPostImage(null)}
                  >
                    <Text style={styles.removeImageButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Add/Change Photo Button */}
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={async () => {
                  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!permissionResult.granted) {
                    Alert.alert('Permission Required', 'Please allow access to your photo library to add photos.');
                    return;
                  }

                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    exif: false,
                  });

                  if (!result.canceled && result.assets && result.assets[0]) {
                    const asset = result.assets[0];
                    try {
                      // Resize to max 800px on longest side while maintaining aspect ratio
                      const maxSize = 800;
                      const width = asset.width || 800;
                      const height = asset.height || 800;

                      let resizeConfig = {};
                      if (width > height && width > maxSize) {
                        resizeConfig = { width: maxSize };
                      } else if (height > maxSize) {
                        resizeConfig = { height: maxSize };
                      }

                      const actions = Object.keys(resizeConfig).length > 0 ? [{ resize: resizeConfig }] : [];

                      const processed = await ImageManipulator.manipulateAsync(
                        asset.uri,
                        actions,
                        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                      );
                      setEditPostImage(processed.base64);
                    } catch (error) {
                      console.error('Image processing error:', error);
                      Alert.alert('Error', 'Failed to process image. Please try again.');
                    }
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.addPhotoButtonIcon}>🖼️</Text>
                <Text style={styles.addPhotoButtonText}>{editPostImage ? 'Change Photo' : 'Add Photo'}</Text>
              </TouchableOpacity>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.postSubmitButton, !editPostContent.trim() && styles.postSubmitButtonDisabled]}
                onPress={handleSaveEditPost}
                disabled={!editPostContent.trim() || isLoadingCommunity}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={editPostContent.trim() ? ['#4ECDC4', '#26A69A'] : ['#555', '#444']}
                  style={styles.postSubmitButtonGradient}
                >
                  {isLoadingCommunity ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.postSubmitButtonText}>Save Changes</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // POST CAMERA SCREEN (for adding photos to posts)
  // ==========================================================================
  if (screen === 'postCamera') {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
            <View style={styles.cameraPermissionContainer}>
              <Text style={styles.cameraPermissionText}>Camera access is required to take photos.</Text>
              <TouchableOpacity style={styles.cameraPermissionButton} onPress={requestPermission}>
                <Text style={styles.cameraPermissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton} onPress={goBack}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <CameraView
          style={styles.camera}
          facing={cameraFacing}
          ref={cameraRef}
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraTopBar}>
              <TouchableOpacity style={styles.cameraCloseButton} onPress={goBack}>
                <Text style={styles.cameraCloseButtonText}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraFlipButton} onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}>
                <Text style={styles.cameraFlipButtonText}>🔄</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cameraBottomBar}>
              <TouchableOpacity
                style={styles.cameraCaptureButton}
                onPress={async () => {
                  if (cameraRef.current) {
                    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
                    setNewPostImage(photo.base64);
                    goBack();
                  }
                }}
              >
                <View style={styles.cameraCaptureButtonInner} />
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // VIEW POST SCREEN
  // ==========================================================================
  if (screen === 'viewPost' && viewingPost) {
    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>📄 Post</Text>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
            {/* Post Details */}
            <View style={styles.viewPostCard}>
              <View style={styles.postHeader}>
                <View style={styles.postAuthorInfo}>
                  <View style={styles.postAvatar}>
                    <Text style={styles.postAvatarText}>
                      {(viewingPost.customer_first_name?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.postAuthorName}>
                      {viewingPost.customer_first_name || 'Anonymous'} {viewingPost.customer_last_name?.[0] || ''}.
                    </Text>
                    <Text style={styles.postTimestamp}>
                      {new Date(viewingPost.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
                {/* Edit/Delete buttons for post owner */}
                {String(viewingPost.customer_id) === String(profile.customerId) && (
                  <View style={styles.postOwnerActions}>
                    <TouchableOpacity
                      style={styles.postOwnerActionButton}
                      onPress={() => handleStartEditPost(viewingPost)}
                    >
                      <Text style={styles.postOwnerActionIcon}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.postOwnerActionButton}
                      onPress={() => handleDeletePost(viewingPost.post_id)}
                    >
                      <Text style={styles.postOwnerActionIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {viewingPost.post_title && (
                <Text style={styles.viewPostTitle}>{viewingPost.post_title}</Text>
              )}
              <Text style={styles.viewPostContent}>{viewingPost.post_content}</Text>

              {viewingPost.post_image && (
                <Image
                  source={{ uri: viewingPost.post_image.startsWith('data:') ? viewingPost.post_image : `data:image/jpeg;base64,${viewingPost.post_image}` }}
                  style={styles.viewPostImage}
                  resizeMode="contain"
                />
              )}

              <View style={styles.postActions}>
                <TouchableOpacity
                  style={styles.postActionButton}
                  onPress={() => handleToggleLike(viewingPost)}
                >
                  <Text style={styles.postActionIcon}>{viewingPost.is_liked_by_me ? '❤️' : '🤍'}</Text>
                  <Text style={styles.postActionText}>{viewingPost.likes_count} likes</Text>
                </TouchableOpacity>
                <View style={styles.postActionButton}>
                  <Text style={styles.postActionIcon}>💬</Text>
                  <Text style={styles.postActionText}>{viewingPost.comments_count} comments</Text>
                </View>
              </View>
            </View>

            {/* Comments Section */}
            <View style={styles.commentsSection}>
              <Text style={styles.commentsSectionTitle}>Comments</Text>

              {/* Add Comment Input */}
              <View style={styles.addCommentContainer}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment..."
                  placeholderTextColor="#a0a0a0"
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <TouchableOpacity
                  style={[styles.commentSubmitButton, !newComment.trim() && styles.commentSubmitButtonDisabled]}
                  onPress={() => handleAddComment(viewingPost.post_id)}
                  disabled={!newComment.trim()}
                >
                  <Text style={styles.commentSubmitText}>Post</Text>
                </TouchableOpacity>
              </View>

              {isLoadingComments ? (
                <ActivityIndicator color="#4ECDC4" style={{ marginTop: 20 }} />
              ) : postComments.length === 0 ? (
                <Text style={styles.noCommentsText}>No comments yet. Be the first!</Text>
              ) : (
                postComments.map(comment => (
                  <View key={comment.comment_id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentAvatar}>
                        <Text style={styles.commentAvatarText}>
                          {(comment.customer_first_name?.[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.commentInfo}>
                        <Text style={styles.commentAuthor}>
                          {comment.customer_first_name || 'Anonymous'}
                        </Text>
                        <Text style={styles.commentTime}>
                          {new Date(comment.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.commentContent}>{comment.comment_content}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
          </KeyboardAvoidingView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // DIARY SCREEN
  // ==========================================================================
  if (screen === 'diary') {
    const isSelectedDateToday = selectedDate === getLocalDateString();

    return (
      <SafeAreaView style={styles.container}>
        <SessionExpiredModal />
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.screenHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>📔 Diary</Text>
            <Text style={styles.screenSubtitle}>
              {isSelectedDateToday ? 'Today' : formatDisplayDate(selectedDate)}
            </Text>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={true}
            >
              {isLoadingDiary ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#27AE60" />
                  <Text style={styles.loadingText}>Loading diary...</Text>
                </View>
              ) : isEditingDiary || !diaryEntry ? (
                /* Edit/Create Mode */
                <View style={styles.diaryEditContainer}>
                  {/* Simple freeform text area */}
                  <TextInput
                    style={styles.diaryFreeformInput}
                    placeholder="Write about your day..."
                    placeholderTextColor="#a0a0a0"
                    value={diaryContent}
                    onChangeText={setDiaryContent}
                    multiline
                    textAlignVertical="top"
                  />

                  {/* Action Buttons */}
                  <View style={styles.diaryActionButtons}>
                    {diaryEntry && (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => {
                          setIsEditingDiary(false);
                          setDiaryContent(diaryEntry.entry_content || '');
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.diarySaveButton, !diaryContent.trim() && styles.diarySaveButtonDisabled]}
                      onPress={handleSaveDiary}
                      disabled={!diaryContent.trim() || isLoadingDiary}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={diaryContent.trim() ? ['#27AE60', '#1E8449'] : ['#555', '#444']}
                        style={styles.diarySaveButtonGradient}
                      >
                        {isLoadingDiary ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.diarySaveButtonText}>
                            {diaryEntry ? 'Update' : 'Save'}
                          </Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* View Mode */
                <View style={styles.diaryViewContainer}>
                  <View style={styles.diaryViewCard}>
                    <Text style={styles.diaryViewContent}>{diaryEntry.entry_content}</Text>

                    <Text style={styles.diaryViewTimestamp}>
                      Last updated: {new Date(diaryEntry.updated_at).toLocaleString()}
                    </Text>
                  </View>

                  {/* Edit/Delete Buttons */}
                  <View style={styles.diaryActionButtons}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handleDeleteDiary}
                    >
                      <Text style={[styles.secondaryButtonText, { color: '#E74C3C' }]}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.diarySaveButton}
                      onPress={() => setIsEditingDiary(true)}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#27AE60', '#1E8449']}
                        style={styles.diarySaveButtonGradient}
                      >
                        <Text style={styles.diarySaveButtonText}>Edit</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // REPORTS MENU SCREEN
  // ==========================================================================
  if (screen === 'reports') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.screenTitle}>📈 Reports</Text>
              <Text style={styles.screenSubtitle}>Track your progress over time</Text>
            </View>

            {/* Report Options */}
            <View style={styles.reportsSection}>
              <Text style={styles.sectionTitle}>Available Reports</Text>
              
              <TouchableOpacity
                style={styles.reportCard}
                onPress={goToMacroWeightReport}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['rgba(155, 89, 182, 0.2)', 'rgba(142, 68, 173, 0.2)']}
                  style={styles.reportCardGradient}
                >
                  <View style={styles.reportCardIcon}>
                    <Text style={styles.reportCardEmoji}>📊</Text>
                  </View>
                  <View style={styles.reportCardContent}>
                    <Text style={styles.reportCardTitle}>Macro vs. Weight Progress</Text>
                    <Text style={styles.reportCardDescription}>
                      See how your nutrition intake impacts your weight over time. 
                      Compare calories, protein, carbs, and fat against weight changes.
                    </Text>
                  </View>
                  <Text style={styles.reportCardArrow}>→</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Consumption vs Burned Report */}
              <TouchableOpacity
                style={styles.reportCard}
                onPress={goToConsumptionVsBurnedReport}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['rgba(46, 204, 113, 0.2)', 'rgba(39, 174, 96, 0.2)']}
                  style={[styles.reportCardGradient, { borderColor: 'rgba(46, 204, 113, 0.3)' }]}
                >
                  <View style={[styles.reportCardIcon, { backgroundColor: 'rgba(46, 204, 113, 0.3)' }]}>
                    <Text style={styles.reportCardEmoji}>🔥</Text>
                  </View>
                  <View style={styles.reportCardContent}>
                    <Text style={styles.reportCardTitle}>Consumption vs. Burned</Text>
                    <Text style={styles.reportCardDescription}>
                      Compare calories consumed against calories burned from your fitness tracker.
                      {connectedProviders.length === 0 && ' Connect a health provider in Profile to get started.'}
                    </Text>
                  </View>
                  <Text style={[styles.reportCardArrow, { color: '#2ECC71' }]}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // MACRO VS WEIGHT PROGRESS REPORT SCREEN
  // ==========================================================================
  if (screen === 'macroWeightReport') {
    // Chart dimensions
    const chartHeight = 250;
    const yAxisWidth = 35; // Width of each Y-axis
    const chartWidth = Dimensions.get('window').width - 40 - (yAxisWidth * 2); // 40px margin + both Y-axes
    
    // Get data for the chart (limit to reasonable number of data points)
    const maxDataPoints = Math.min(reportData?.dates?.length || 0, 14);
    const startIndex = Math.max(0, (reportData?.dates?.length || 0) - maxDataPoints);
    
    const chartDates = reportData?.dates?.slice(startIndex) || [];
    const chartWeights = reportData?.weights?.slice(startIndex) || [];
    const chartCalories = reportData?.calories?.slice(startIndex) || [];
    const chartProteins = reportData?.proteins?.slice(startIndex) || [];
    const chartCarbs = reportData?.carbs?.slice(startIndex) || [];
    const chartFibers = reportData?.fibers?.slice(startIndex) || [];
    const chartFats = reportData?.fats?.slice(startIndex) || [];

    // Calculate net carbs for each day
    const chartNetCarbs = chartCarbs.map((carb, i) => calculateNetCarbs(carb, chartFibers[i] || 0));

    // Calculate scales
    const weightMin = chartWeights.length > 0 ? Math.min(...chartWeights.filter(w => w > 0)) * 0.95 : 0;
    const weightMax = chartWeights.length > 0 ? Math.max(...chartWeights) * 1.05 : 100;
    const weightRange = weightMax - weightMin || 1;

    // For macros, find the max value across all macros (proteins, carbs, net carbs, fats, and scaled calories)
    const allMacroValues = [
      ...chartProteins,
      ...chartCarbs,
      ...chartNetCarbs,
      ...chartFats,
      ...chartCalories.map(c => c / 10) // Scale calories down by 10
    ].filter(v => v > 0);
    const macroMax = allMacroValues.length > 0 ? Math.max(...allMacroValues) * 1.1 : 300;
    
    // Helper function to calculate Y position for weight
    const getWeightY = (weight) => {
      if (!weight || weight <= 0) return chartHeight;
      return chartHeight - ((weight - weightMin) / weightRange) * chartHeight;
    };
    
    // Helper function to calculate Y position for macros
    const getMacroY = (value) => {
      if (!value || value <= 0) return chartHeight;
      return chartHeight - (value / macroMax) * chartHeight;
    };
    
    // Helper to format date labels
    const formatDateLabel = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      return `${parts[1]}-${parts[2]}`;
    };
    
    // Generate line path points
    const generateLinePath = (data, getY) => {
      if (!data || data.length === 0) return [];
      const barWidth = chartWidth / data.length;
      return data.map((value, index) => ({
        x: (index * barWidth) + (barWidth / 2),
        y: getY(value),
        value
      }));
    };

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>📊 Macro vs. Weight</Text>
              <Text style={styles.screenSubtitle}>Your nutrition impact on weight</Text>
            </View>

            {/* Date Range Selector */}
            <View style={styles.dateRangeSelector}>
              {[7, 14, 30, 60, 90].map(days => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.dateRangeButton,
                    reportDateRange === days && styles.dateRangeButtonActive
                  ]}
                  onPress={() => loadReportWithRange(days)}
                >
                  <Text style={[
                    styles.dateRangeButtonText,
                    reportDateRange === days && styles.dateRangeButtonTextActive
                  ]}>
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isLoadingReport ? (
              <View style={styles.reportLoadingContainer}>
                <ActivityIndicator size="large" color="#9B59B6" />
                <Text style={styles.reportLoadingText}>Loading report data...</Text>
              </View>
            ) : reportData && (chartWeights.length > 0 || chartCalories.length > 0) ? (
              <>
                {/* Combined Chart Section */}
                <View style={styles.chartSection}>
                  <Text style={styles.chartTitle}>Daily Weight vs. Macros & Calories</Text>
                  
                  {/* Legend */}
                  <View style={styles.combinedChartLegend}>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendBar, { backgroundColor: 'rgba(180, 180, 180, 0.8)' }]} />
                        <Text style={styles.legendText}>Weight ({profile.weightUnit})</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#2ECC71' }]} />
                        <View style={[styles.legendDot, { backgroundColor: '#2ECC71' }]} />
                        <Text style={styles.legendText}>Protein (g)</Text>
                      </View>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#FFE66D' }]} />
                        <View style={[styles.legendDot, { backgroundColor: '#FFE66D' }]} />
                        <Text style={styles.legendText}>Carbs (g)</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#4ECDC4' }]} />
                        <View style={[styles.legendDot, { backgroundColor: '#4ECDC4' }]} />
                        <Text style={styles.legendText}>Net Carbs (g)</Text>
                      </View>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: '#A78BFA' }]} />
                        <View style={[styles.legendDot, { backgroundColor: '#A78BFA' }]} />
                        <Text style={styles.legendText}>Fats (g)</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendLineDashed, { borderColor: '#9B59B6' }]} />
                        <Text style={styles.legendText}>Calories (÷10)</Text>
                      </View>
                    </View>
                  </View>

                  {/* Chart Container */}
                  <View style={styles.combinedChartContainer}>
                    {/* Left Y-Axis (Weight) */}
                    <View style={styles.yAxisLeft}>
                      <Text style={styles.yAxisLabel}>{Math.round(weightMax)}</Text>
                      <Text style={styles.yAxisLabel}>{Math.round((weightMax + weightMin) / 2)}</Text>
                      <Text style={styles.yAxisLabel}>{Math.round(weightMin)}</Text>
                    </View>
                    
                    {/* Chart Area */}
                    <View style={[styles.chartArea, { height: chartHeight, width: chartWidth }]}>
                      {/* Grid Lines */}
                      <View style={[styles.gridLine, { top: 0 }]} />
                      <View style={[styles.gridLine, { top: '50%' }]} />
                      <View style={[styles.gridLine, { top: '100%' }]} />
                      
                      {/* Weight Bars - only render non-zero weights */}
                      {chartWeights.map((weight, index) => {
                        if (!weight || weight <= 0) {
                          return null;
                        }
                        const barWidth = chartWidth / chartDates.length;
                        const barHeight = ((weight - weightMin) / weightRange) * chartHeight;
                        return (
                          <View
                            key={`bar-${index}`}
                            style={[
                              styles.weightBarCombined,
                              {
                                left: index * barWidth + barWidth * 0.15,
                                width: barWidth * 0.7,
                                height: barHeight,
                                bottom: 0,
                              }
                            ]}
                          />
                        );
                      })}
                      
                      {/* Protein Line */}
                      {generateLinePath(chartProteins, getMacroY).map((point, index, arr) => (
                        <React.Fragment key={`protein-${index}`}>
                          {index > 0 && arr[index - 1].value > 0 && point.value > 0 && (
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: arr[index - 1].x,
                                  top: arr[index - 1].y,
                                  width: Math.sqrt(
                                    Math.pow(point.x - arr[index - 1].x, 2) +
                                    Math.pow(point.y - arr[index - 1].y, 2)
                                  ),
                                  backgroundColor: '#2ECC71',
                                  transform: [
                                    { rotate: `${Math.atan2(point.y - arr[index - 1].y, point.x - arr[index - 1].x)}rad` }
                                  ],
                                  transformOrigin: 'left center',
                                }
                              ]}
                            />
                          )}
                          {point.value > 0 && (
                            <View
                              style={[
                                styles.chartDot,
                                {
                                  left: point.x - 4,
                                  top: point.y - 4,
                                  backgroundColor: '#2ECC71',
                                }
                              ]}
                            />
                          )}
                        </React.Fragment>
                      ))}
                      
                      {/* Carbs Line */}
                      {generateLinePath(chartCarbs, getMacroY).map((point, index, arr) => (
                        <React.Fragment key={`carbs-${index}`}>
                          {index > 0 && arr[index - 1].value > 0 && point.value > 0 && (
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: arr[index - 1].x,
                                  top: arr[index - 1].y,
                                  width: Math.sqrt(
                                    Math.pow(point.x - arr[index - 1].x, 2) +
                                    Math.pow(point.y - arr[index - 1].y, 2)
                                  ),
                                  backgroundColor: '#FFE66D',
                                  transform: [
                                    { rotate: `${Math.atan2(point.y - arr[index - 1].y, point.x - arr[index - 1].x)}rad` }
                                  ],
                                  transformOrigin: 'left center',
                                }
                              ]}
                            />
                          )}
                          {point.value > 0 && (
                            <View
                              style={[
                                styles.chartDot,
                                {
                                  left: point.x - 4,
                                  top: point.y - 4,
                                  backgroundColor: '#FFE66D',
                                }
                              ]}
                            />
                          )}
                        </React.Fragment>
                      ))}

                      {/* Net Carbs Line */}
                      {generateLinePath(chartNetCarbs, getMacroY).map((point, index, arr) => (
                        <React.Fragment key={`netcarbs-${index}`}>
                          {index > 0 && arr[index - 1].value > 0 && point.value > 0 && (
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: arr[index - 1].x,
                                  top: arr[index - 1].y,
                                  width: Math.sqrt(
                                    Math.pow(point.x - arr[index - 1].x, 2) +
                                    Math.pow(point.y - arr[index - 1].y, 2)
                                  ),
                                  backgroundColor: '#4ECDC4',
                                  transform: [
                                    { rotate: `${Math.atan2(point.y - arr[index - 1].y, point.x - arr[index - 1].x)}rad` }
                                  ],
                                  transformOrigin: 'left center',
                                }
                              ]}
                            />
                          )}
                          {point.value > 0 && (
                            <View
                              style={[
                                styles.chartDot,
                                {
                                  left: point.x - 4,
                                  top: point.y - 4,
                                  backgroundColor: '#4ECDC4',
                                }
                              ]}
                            />
                          )}
                        </React.Fragment>
                      ))}
                      
                      {/* Fats Line */}
                      {generateLinePath(chartFats, getMacroY).map((point, index, arr) => (
                        <React.Fragment key={`fats-${index}`}>
                          {index > 0 && arr[index - 1].value > 0 && point.value > 0 && (
                            <View
                              style={[
                                styles.chartLine,
                                {
                                  left: arr[index - 1].x,
                                  top: arr[index - 1].y,
                                  width: Math.sqrt(
                                    Math.pow(point.x - arr[index - 1].x, 2) +
                                    Math.pow(point.y - arr[index - 1].y, 2)
                                  ),
                                  backgroundColor: '#A78BFA',
                                  transform: [
                                    { rotate: `${Math.atan2(point.y - arr[index - 1].y, point.x - arr[index - 1].x)}rad` }
                                  ],
                                  transformOrigin: 'left center',
                                }
                              ]}
                            />
                          )}
                          {point.value > 0 && (
                            <View
                              style={[
                                styles.chartDot,
                                {
                                  left: point.x - 4,
                                  top: point.y - 4,
                                  backgroundColor: '#A78BFA',
                                }
                              ]}
                            />
                          )}
                        </React.Fragment>
                      ))}
                      
                      {/* Calories Line (Dashed - scaled by /10) */}
                      {generateLinePath(chartCalories.map(c => c / 10), getMacroY).map((point, index, arr) => (
                        <React.Fragment key={`calories-${index}`}>
                          {index > 0 && arr[index - 1].value > 0 && point.value > 0 && (
                            <View
                              style={[
                                styles.chartLineDashed,
                                {
                                  left: arr[index - 1].x,
                                  top: arr[index - 1].y,
                                  width: Math.sqrt(
                                    Math.pow(point.x - arr[index - 1].x, 2) +
                                    Math.pow(point.y - arr[index - 1].y, 2)
                                  ),
                                  borderColor: '#9B59B6',
                                  transform: [
                                    { rotate: `${Math.atan2(point.y - arr[index - 1].y, point.x - arr[index - 1].x)}rad` }
                                  ],
                                  transformOrigin: 'left center',
                                }
                              ]}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </View>
                    
                    {/* Right Y-Axis (Macros) */}
                    <View style={styles.yAxisRight}>
                      <Text style={styles.yAxisLabel}>{Math.round(macroMax)}</Text>
                      <Text style={styles.yAxisLabel}>{Math.round(macroMax / 2)}</Text>
                      <Text style={styles.yAxisLabel}>0</Text>
                    </View>
                  </View>
                  
                  {/* X-Axis Labels */}
                  <View style={styles.xAxisContainer}>
                    <View style={{ width: 35 }} />
                    <View style={[styles.xAxisLabels, { width: chartWidth }]}>
                      {chartDates.map((date, index) => {
                        // Show every nth label based on data count
                        const showLabel = chartDates.length <= 7 || index % Math.ceil(chartDates.length / 7) === 0;
                        const barWidth = chartWidth / chartDates.length;
                        return (
                          <View 
                            key={index} 
                            style={{
                              position: 'absolute',
                              left: index * barWidth + barWidth * 0.5,
                              alignItems: 'center',
                            }}
                          >
                            {showLabel && (
                              <Text style={styles.xAxisLabel}>{formatDateLabel(date)}</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ width: 35 }} />
                  </View>
                  
                  <Text style={styles.xAxisTitle}>Date</Text>
                  
                  {/* Y-Axis Titles */}
                  <View style={styles.yAxisTitles}>
                    <Text style={styles.yAxisTitleLeft}>Weight ({profile.weightUnit})</Text>
                    <Text style={styles.yAxisTitleRight}>Macros (g) / Calories (÷10)</Text>
                  </View>
                  
                  {/* Download CSV Link */}
                  <TouchableOpacity
                    style={styles.downloadCsvLink}
                    onPress={() => exportChartDataToCSV(
                      chartDates,
                      chartWeights,
                      chartCalories,
                      chartProteins,
                      chartCarbs,
                      chartFats,
                      profile.weightUnit
                    )}
                  >
                    <Text style={styles.downloadCsvText}>📥 Download Chart Data (.csv)</Text>
                  </TouchableOpacity>
                </View>

                {/* Weight Summary Stats */}
                {chartWeights.length > 0 && chartWeights.some(w => w > 0) && (
                  <View style={styles.chartSection}>
                    <Text style={styles.chartTitle}>⚖️ Weight Summary</Text>
                    <View style={styles.weightStats}>
                      <View style={styles.weightStatItem}>
                        <Text style={styles.weightStatLabel}>Start</Text>
                        <Text style={styles.weightStatValue}>
                          {chartWeights.find(w => w > 0)?.toFixed(1) || '-'} {profile.weightUnit}
                        </Text>
                      </View>
                      <View style={styles.weightStatItem}>
                        <Text style={styles.weightStatLabel}>Current</Text>
                        <Text style={styles.weightStatValue}>
                          {chartWeights.filter(w => w > 0).slice(-1)[0]?.toFixed(1) || '-'} {profile.weightUnit}
                        </Text>
                      </View>
                      <View style={styles.weightStatItem}>
                        <Text style={styles.weightStatLabel}>Change</Text>
                        <Text style={[
                          styles.weightStatValue,
                          { 
                            color: (() => {
                              const validWeights = chartWeights.filter(w => w > 0);
                              if (validWeights.length < 2) return '#fff';
                              const change = validWeights[validWeights.length - 1] - validWeights[0];
                              return change <= 0 ? '#2ECC71' : '#FF6B6B';
                            })()
                          }
                        ]}>
                          {(() => {
                            const validWeights = chartWeights.filter(w => w > 0);
                            if (validWeights.length < 2) return '-';
                            const change = validWeights[validWeights.length - 1] - validWeights[0];
                            return `${change > 0 ? '+' : ''}${change.toFixed(1)} ${profile.weightUnit}`;
                          })()}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Insights Section */}
                {chartWeights.some(w => w > 0) && chartCalories.some(c => c > 0) && (
                  <View style={styles.insightsSection}>
                    <Text style={styles.insightsTitle}>💡 Insights</Text>
                    <View style={styles.insightCard}>
                      <Text style={styles.insightText}>
                        {(() => {
                          const validWeights = chartWeights.filter(w => w > 0);
                          const validCalories = chartCalories.filter(c => c > 0);
                          if (validWeights.length < 2 || validCalories.length === 0) {
                            return 'Keep logging your weight and meals to see personalized insights!';
                          }
                          const weightChange = validWeights[validWeights.length - 1] - validWeights[0];
                          const avgCalories = Math.round(validCalories.reduce((a, b) => a + b, 0) / validCalories.length);
                          
                          if (weightChange < -0.5) {
                            return `Great progress! You've lost ${Math.abs(weightChange).toFixed(1)} ${profile.weightUnit} while averaging ${avgCalories} calories per day.`;
                          } else if (weightChange > 0.5) {
                            return `You've gained ${weightChange.toFixed(1)} ${profile.weightUnit} while averaging ${avgCalories} calories per day. Consider adjusting your intake.`;
                          } else {
                            return `Your weight has been stable while averaging ${avgCalories} calories per day. You're maintaining well!`;
                          }
                        })()}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataIcon}>📊</Text>
                <Text style={styles.noDataText}>No data available</Text>
                <Text style={styles.noDataSubtext}>Start tracking your food and weight to see reports!</Text>
              </View>
            )}
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // CONSUMPTION VS BURNED REPORT SCREEN
  // ==========================================================================
  if (screen === 'consumptionVsBurnedReport') {
    // Chart dimensions
    const chartHeight = 250;
    const yAxisWidth = 50; // Width for Y-axis labels
    const chartWidth = Dimensions.get('window').width - 40 - yAxisWidth; // 20px margin on each side minus Y-axis

    // Get data for the chart
    const maxDataPoints = Math.min(consumptionBurnedData?.dates?.length || 0, 14);
    const startIndex = Math.max(0, (consumptionBurnedData?.dates?.length || 0) - maxDataPoints);

    const chartDates = consumptionBurnedData?.dates?.slice(startIndex) || [];
    const chartConsumed = consumptionBurnedData?.calories_consumed?.slice(startIndex) || [];
    const chartBurned = consumptionBurnedData?.calories_burned?.slice(startIndex) || [];
    const chartNet = consumptionBurnedData?.net_calories?.slice(startIndex) || [];

    // Calculate scales
    const allValues = [...chartConsumed, ...chartBurned].filter(v => v > 0);
    const maxCalories = allValues.length > 0 ? Math.max(...allValues) * 1.1 : 3000;

    // Helper to calculate Y position
    const getCaloriesY = (value) => {
      if (!value || value <= 0) return chartHeight;
      return chartHeight - (value / maxCalories) * chartHeight;
    };

    // Helper to format date labels
    const formatDateLabel = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      return `${parts[1]}-${parts[2]}`;
    };

    // Generate bar positions
    const barWidth = chartWidth / Math.max(chartDates.length, 1) - 4;
    const halfBarWidth = barWidth / 2 - 1;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>🔥 Consumption vs. Burned</Text>
              <Text style={styles.screenSubtitle}>Compare calories in vs. out</Text>
            </View>

            {/* Date Range Selector */}
            <View style={styles.dateRangeSelector}>
              {[7, 14, 30, 60, 90].map(days => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.dateRangeButton,
                    consumptionBurnedDateRange === days && styles.dateRangeButtonActive
                  ]}
                  onPress={() => loadConsumptionBurnedWithRange(days)}
                >
                  <Text style={[
                    styles.dateRangeText,
                    consumptionBurnedDateRange === days && styles.dateRangeTextActive
                  ]}>
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isLoadingReport ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2ECC71" />
                <Text style={styles.loadingText}>Loading report...</Text>
              </View>
            ) : !consumptionBurnedData || chartDates.length === 0 ? (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataIcon}>📊</Text>
                <Text style={styles.noDataText}>No data available</Text>
                <Text style={styles.noDataSubtext}>
                  {connectedProviders.length === 0
                    ? 'Connect a health provider in your Profile to track calories burned.'
                    : 'Start tracking your food intake to see this report!'
                  }
                </Text>
                {connectedProviders.length === 0 && (
                  <TouchableOpacity
                    style={styles.connectProviderLink}
                    onPress={() => {
                      setActiveTab('profile');
                      goHome();
                    }}
                  >
                    <Text style={styles.connectProviderLinkText}>Go to Profile →</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {/* Summary Cards */}
                <View style={styles.consumptionBurnedSummary}>
                  <View style={[styles.summaryCard, { borderLeftColor: '#FF6B6B' }]}>
                    <Text style={styles.summaryLabel}>Total Consumed</Text>
                    <Text style={[styles.summaryValue, { color: '#FF6B6B' }]}>
                      {Math.round(consumptionBurnedData.summary?.total_consumed || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.summaryUnit}>kcal</Text>
                  </View>
                  <View style={[styles.summaryCard, { borderLeftColor: '#2ECC71' }]}>
                    <Text style={styles.summaryLabel}>Total Burned</Text>
                    <Text style={[styles.summaryValue, { color: '#2ECC71' }]}>
                      {Math.round(consumptionBurnedData.summary?.total_burned || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.summaryUnit}>kcal</Text>
                  </View>
                  <View style={[styles.summaryCard, { borderLeftColor: consumptionBurnedData.summary?.net_calories < 0 ? '#2ECC71' : '#FF6B6B' }]}>
                    <Text style={styles.summaryLabel}>Net Calories</Text>
                    <Text style={[styles.summaryValue, { color: consumptionBurnedData.summary?.net_calories < 0 ? '#2ECC71' : '#FF6B6B' }]}>
                      {(consumptionBurnedData.summary?.net_calories || 0) > 0 ? '+' : ''}{Math.round(consumptionBurnedData.summary?.net_calories || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.summaryUnit}>kcal</Text>
                  </View>
                </View>

                {/* Chart */}
                <View style={styles.chartSection}>
                  <Text style={styles.chartSectionTitle}>Daily Comparison</Text>

                  {/* Legend */}
                  <View style={styles.chartLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                      <Text style={styles.legendText}>Consumed</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#2ECC71' }]} />
                      <Text style={styles.legendText}>Burned</Text>
                    </View>
                  </View>

                  {/* Chart Area with Y-axis */}
                  <View style={styles.chartContainer}>
                    <View style={{ flexDirection: 'row' }}>
                      {/* Y-axis labels */}
                      <View style={{ width: yAxisWidth, height: chartHeight, justifyContent: 'space-between', paddingRight: 8 }}>
                        {[1, 0.75, 0.5, 0.25, 0].map((ratio, i) => (
                          <Text key={i} style={styles.yAxisLabel}>
                            {Math.round(maxCalories * ratio)}
                          </Text>
                        ))}
                      </View>

                      {/* Chart area */}
                      <View style={[styles.chartArea, { height: chartHeight, width: chartWidth }]}>
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                          <View
                            key={i}
                            style={[styles.gridLine, { top: ratio * chartHeight }]}
                          />
                        ))}

                        {/* Bars */}
                        {chartDates.map((date, index) => {
                          const x = (index * (chartWidth / chartDates.length)) + 2;
                          const consumedHeight = (chartConsumed[index] || 0) / maxCalories * chartHeight;
                          const burnedHeight = (chartBurned[index] || 0) / maxCalories * chartHeight;

                          return (
                            <View key={date} style={{ position: 'absolute', left: x, bottom: 0 }}>
                              {/* Consumed bar (red) */}
                              <View
                                style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  width: halfBarWidth,
                                  height: consumedHeight,
                                  backgroundColor: '#FF6B6B',
                                  borderTopLeftRadius: 2,
                                  borderTopRightRadius: 2,
                                }}
                              />
                              {/* Burned bar (green) */}
                              <View
                                style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: halfBarWidth + 2,
                                  width: halfBarWidth,
                                  height: burnedHeight,
                                  backgroundColor: '#2ECC71',
                                  borderTopLeftRadius: 2,
                                  borderTopRightRadius: 2,
                                }}
                              />
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* X-axis labels */}
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <View style={{ width: yAxisWidth }} />
                      <View style={{ flexDirection: 'row', width: chartWidth, position: 'relative', height: 20 }}>
                        {chartDates.map((date, index) => {
                          // Show every nth label based on data count (same pattern as macroWeightReport)
                          const showLabel = chartDates.length <= 7 || index % Math.ceil(chartDates.length / 7) === 0;
                          const barWidth = chartWidth / chartDates.length;
                          return (
                            <View
                              key={date}
                              style={{
                                position: 'absolute',
                                left: index * barWidth + barWidth * 0.5,
                                alignItems: 'center',
                              }}
                            >
                              {showLabel && (
                                <Text style={styles.xAxisLabel}>{formatDateLabel(date)}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* Axis title */}
                    <Text style={styles.xAxisTitle}>Date</Text>
                  </View>

                  {/* Download CSV Link */}
                  <TouchableOpacity
                    style={styles.downloadCsvLink}
                    onPress={() => exportConsumptionBurnedToCSV(
                      chartDates,
                      chartConsumed,
                      chartBurned,
                      chartNet
                    )}
                  >
                    <Text style={styles.downloadCsvText}>📥 Download Chart Data (.csv)</Text>
                  </TouchableOpacity>
                </View>

                {/* Daily Average */}
                <View style={styles.insightsSection}>
                  <Text style={styles.insightsTitle}>Daily Averages</Text>
                  <View style={styles.averagesRow}>
                    <View style={styles.averageItem}>
                      <Text style={styles.averageLabel}>Consumed</Text>
                      <Text style={[styles.averageValue, { color: '#FF6B6B' }]}>
                        {Math.round(consumptionBurnedData.summary?.avg_consumed || 0)} kcal
                      </Text>
                    </View>
                    <View style={styles.averageItem}>
                      <Text style={styles.averageLabel}>Burned</Text>
                      <Text style={[styles.averageValue, { color: '#2ECC71' }]}>
                        {Math.round(consumptionBurnedData.summary?.avg_burned || 0)} kcal
                      </Text>
                    </View>
                    <View style={styles.averageItem}>
                      <Text style={styles.averageLabel}>Net</Text>
                      <Text style={[styles.averageValue, { color: (consumptionBurnedData.summary?.avg_net || 0) < 0 ? '#2ECC71' : '#FF6B6B' }]}>
                        {(consumptionBurnedData.summary?.avg_net || 0) > 0 ? '+' : ''}{Math.round(consumptionBurnedData.summary?.avg_net || 0)} kcal
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Provider Info */}
                {consumptionBurnedData.provider && (
                  <View style={styles.providerInfoSection}>
                    <Text style={styles.providerInfoText}>
                      Calories burned from: {HEALTH_PROVIDERS[consumptionBurnedData.provider]?.name || consumptionBurnedData.provider}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (screen === 'savedMeals') {
    // If editing a saved meal, show the edit form
    if (editingSavedMeal) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />
          <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
              <View style={styles.screenHeader}>
                <TouchableOpacity style={styles.backButton} onPress={handleCancelEditSavedMeal}>
                  <Text style={styles.backButtonText}>← Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.screenTitle}>✏️ Edit Saved Meal</Text>
                <Text style={styles.screenSubtitle}>
                  {selectedMeal?.icon} {selectedMeal?.name} Favorite
                </Text>
              </View>

              {/* Food Description Section */}
              <View style={styles.manualSection}>
                <Text style={styles.sectionTitle}>🍽️ Food Details</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Food Description *</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={editingSavedMeal.description}
                    onChangeText={(val) => setEditingSavedMeal({ ...editingSavedMeal, description: val })}
                    placeholder="e.g., Grilled chicken breast with rice"
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Nutrition Section */}
              <View style={styles.manualSection}>
                <Text style={styles.sectionTitle}>📊 Nutrition Information</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>🔥 Calories</Text>
                  <TextInput
                    style={styles.input}
                    value={editingSavedMeal.calories}
                    onChangeText={(val) => setEditingSavedMeal({ ...editingSavedMeal, calories: val })}
                    placeholder="e.g., 450"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.macroInputRow}>
                  <View style={styles.macroInputGroupManual}>
                    <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>💪 Protein (g)</Text>
                    <TextInput
                      style={[styles.input, styles.macroInput]}
                      value={editingSavedMeal.proteins}
                      onChangeText={(val) => setEditingSavedMeal({ ...editingSavedMeal, proteins: val })}
                      placeholder="0"
                      placeholderTextColor="#666"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.macroInputGroupManual}>
                    <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🍞 Carbs (g)</Text>
                    <TextInput
                      style={[styles.input, styles.macroInput]}
                      value={editingSavedMeal.carbs}
                      onChangeText={(val) => setEditingSavedMeal({ ...editingSavedMeal, carbs: val })}
                      placeholder="0"
                      placeholderTextColor="#666"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.macroInputGroupManual}>
                    <Text style={[styles.inputLabel, { color: '#A78BFA' }]}>🥑 Fat (g)</Text>
                    <TextInput
                      style={[styles.input, styles.macroInput]}
                      value={editingSavedMeal.fats}
                      onChangeText={(val) => setEditingSavedMeal({ ...editingSavedMeal, fats: val })}
                      placeholder="0"
                      placeholderTextColor="#666"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Number of Servings */}
              <View style={styles.manualSection}>
                <Text style={styles.sectionTitle}>🔢 Number of Servings</Text>
                <View style={styles.servingsContainer}>
                  <TouchableOpacity
                    style={styles.servingsButton}
                    onPress={() => {
                      const current = parseFloat(savedMealServings) || 1;
                      if (current > 0.5) {
                        handleSavedMealServingsChange(String(Math.round((current - 0.5) * 10) / 10));
                      }
                    }}
                  >
                    <Text style={styles.servingsButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.servingsInput}
                    value={savedMealServings}
                    onChangeText={handleSavedMealServingsChange}
                    keyboardType="decimal-pad"
                    textAlign="center"
                  />
                  <TouchableOpacity
                    style={styles.servingsButton}
                    onPress={() => {
                      const current = parseFloat(savedMealServings) || 1;
                      handleSavedMealServingsChange(String(Math.round((current + 0.5) * 10) / 10));
                    }}
                  >
                    <Text style={styles.servingsButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.servingsQuickButtons}>
                  {[0.5, 1, 1.5, 2, 3].map(val => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.servingsQuickButton,
                        parseFloat(savedMealServings) === val && styles.servingsQuickButtonActive
                      ]}
                      onPress={() => handleSavedMealServingsChange(String(val))}
                    >
                      <Text style={[
                        styles.servingsQuickButtonText,
                        parseFloat(savedMealServings) === val && styles.servingsQuickButtonTextActive
                      ]}>{val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {savedMealServings !== '1' && baseSavedMealNutrition && (
                  <Text style={styles.servingsNote}>
                    Base serving: {baseSavedMealNutrition.calories} kcal
                  </Text>
                )}
              </View>

              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom Action Buttons */}
            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={[styles.bottomButton, styles.bottomButtonSecondary]}
                onPress={handleCancelEditSavedMeal}
              >
                <Text style={styles.bottomButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bottomButton}
                onPress={handleSaveEditedSavedMeal}
                disabled={isSaving}
              >
                <LinearGradient colors={['#F39C12', '#E67E22']} style={styles.bottomButtonGradient}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.bottomButtonText}>💾 Save Changes</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </SafeAreaView>
      );
    }

    // Normal saved meals list view
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <View style={styles.screenHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>⭐ Saved Meals</Text>
            <Text style={styles.screenSubtitle}>
              {selectedMeal?.icon} {selectedMeal?.name} Favorites
            </Text>
          </View>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {isLoadingSavedMeals ? (
              <View style={styles.searchingContainer}>
                <ActivityIndicator size="large" color="#F39C12" />
                <Text style={styles.searchingText}>Loading saved meals...</Text>
              </View>
            ) : savedMealsForMeal.length > 0 ? (
              <>
                <Text style={styles.savedMealsCount}>
                  {savedMealsForMeal.length} saved meal{savedMealsForMeal.length !== 1 ? 's' : ''}
                </Text>
                {savedMealsForMeal.map((meal, index) => (
                  <View key={meal.saved_meal_id || index} style={styles.savedMealCard}>
                    <TouchableOpacity
                      style={styles.savedMealContent}
                      onPress={() => handleSelectSavedMeal(meal)}
                    >
                      <Text style={styles.savedMealName} numberOfLines={2}>
                        {meal.food_description}
                      </Text>
                      <View style={styles.savedMealMacros}>
                        <Text style={styles.savedMealMacro}>
                          🔥 {meal.food_calories || 0} kcal
                        </Text>
                        <Text style={[styles.savedMealMacro, { color: '#FFE66D' }]}>
                          🍞 {Math.round((meal.food_carbs || 0) * 10) / 10}g C
                        </Text>
                        <Text style={[styles.savedMealMacro, { color: '#4ECDC4' }]}>
                          ⚡ {calculateNetCarbs(meal.food_carbs, meal.food_fiber)}g NC
                        </Text>
                        <Text style={[styles.savedMealMacro, { color: '#8E44AD' }]}>
                          🥬 {Math.round((meal.food_fiber || 0) * 10) / 10}g
                        </Text>
                        <Text style={[styles.savedMealMacro, { color: '#FF6B6B' }]}>
                          💪 {Math.round((meal.food_proteins || 0) * 10) / 10}g
                        </Text>
                        <Text style={[styles.savedMealMacro, { color: '#A78BFA' }]}>
                          🥑 {Math.round((meal.food_fats || 0) * 10) / 10}g
                        </Text>
                      </View>
                      <Text style={styles.savedMealTapHint}>Tap to add to today's {selectedMeal?.name.toLowerCase()}</Text>
                    </TouchableOpacity>
                    <View style={styles.savedMealActions}>
                      <TouchableOpacity
                        style={styles.savedMealEditButton}
                        onPress={() => handleEditSavedMeal(meal)}
                      >
                        <Text style={styles.savedMealEditText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.savedMealDeleteButton}
                        onPress={() => handleDeleteSavedMeal(meal.saved_meal_id)}
                      >
                        <Text style={styles.savedMealDeleteText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <View style={{ height: 100 }} />
              </>
            ) : (
              <View style={styles.noSavedMealsContainer}>
                <Text style={styles.noSavedMealsIcon}>⭐</Text>
                <Text style={styles.noSavedMealsText}>No saved meals yet</Text>
                <Text style={styles.noSavedMealsSubtext}>
                  Save your favorite {selectedMeal?.name.toLowerCase()} items for quick access!
                </Text>
                <Text style={styles.noSavedMealsHint}>
                  To save a meal, add a food entry and tap "Save as Favorite"
                </Text>
                <TouchableOpacity
                  style={styles.goToSearchButton}
                  onPress={goToFoodSearch}
                >
                  <Text style={styles.goToSearchButtonText}>🔍 Search for Food</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // MANUAL ENTRY SCREEN (with food details from search or manual input)
  // ==========================================================================
  if (screen === 'manual') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>
                {selectedFood ? '🍽️ Add Food Entry' : '✏️ Manual Entry'}
              </Text>
              <Text style={styles.screenSubtitle}>
                {selectedMeal?.icon} {selectedMeal?.name}
              </Text>
            </View>
            {selectedFood && (
              <View style={styles.selectedFoodBanner}>
                <Text style={styles.selectedFoodName} numberOfLines={1}>
                  {selectedFood.name}
                </Text>
                {selectedFood.brandName && (
                  <Text style={styles.selectedFoodBrand}>{selectedFood.brandName}</Text>
                )}
                <Text style={styles.selectedFoodServing}>
                  Base: {selectedFood.servingDescription || 'Per serving'}
                </Text>
              </View>
            )}
            {selectedFood && baseNutrition && (
              <View style={styles.manualSection}>
                <Text style={styles.sectionTitle}>🔢 Number of Servings</Text>
                <View style={styles.servingsContainer}>
                  <TouchableOpacity
                    style={styles.servingsButton}
                    onPress={() => {
                      const current = parseFloat(manualEntry.servings) || 1;
                      if (current > 0.5) {
                        handleServingsChange(String(Math.round((current - 0.5) * 10) / 10));
                      }
                    }}
                  >
                    <Text style={styles.servingsButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.servingsInput}
                    value={manualEntry.servings}
                    onChangeText={handleServingsChange}
                    keyboardType="decimal-pad"
                    textAlign="center"
                  />
                  <TouchableOpacity
                    style={styles.servingsButton}
                    onPress={() => {
                      const current = parseFloat(manualEntry.servings) || 1;
                      handleServingsChange(String(Math.round((current + 0.5) * 10) / 10));
                    }}
                  >
                    <Text style={styles.servingsButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.servingsQuickButtons}>
                  {[0.5, 1, 1.5, 2].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.servingsQuickButton,
                        parseFloat(manualEntry.servings) === val && styles.servingsQuickButtonActive
                      ]}
                      onPress={() => handleServingsChange(String(val))}
                    >
                      <Text style={[
                        styles.servingsQuickButtonText,
                        parseFloat(manualEntry.servings) === val && styles.servingsQuickButtonTextActive
                      ]}>{val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>📅 Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={manualEntry.date}
                    onChangeText={(val) => setManualEntry({ ...manualEntry, date: val })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.inputLabel}>Time</Text>
                  <TextInput
                    style={styles.input}
                    value={manualEntry.time}
                    onChangeText={(val) => setManualEntry({ ...manualEntry, time: val })}
                    placeholder="HH:MM"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>
            </View>
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>🍽️ Food Details</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Food Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={manualEntry.description}
                  onChangeText={(val) => setManualEntry({ ...manualEntry, description: val })}
                  placeholder="e.g., Grilled chicken breast with rice and vegetables"
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>
                📊 Nutrition Information
                {selectedFood && manualEntry.servings !== '1' && (
                  <Text style={styles.nutritionServingNote}>
                    {' '}(for {manualEntry.servings} serving{parseFloat(manualEntry.servings) !== 1 ? 's' : ''})
                  </Text>
                )}
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🔥 Calories *</Text>
                <TextInput
                  style={[styles.input, selectedFood && styles.inputCalculated]}
                  value={manualEntry.calories}
                  onChangeText={(val) => {
                    setManualEntry({ ...manualEntry, calories: val });
                    if (selectedFood) setBaseNutrition(null);
                  }}
                  placeholder="e.g., 450"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>💪 Protein (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput, selectedFood && styles.inputCalculated]}
                    value={manualEntry.proteins}
                    onChangeText={(val) => {
                      setManualEntry({ ...manualEntry, proteins: val });
                      if (selectedFood) setBaseNutrition(null);
                    }}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🍞 Carbs (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput, selectedFood && styles.inputCalculated]}
                    value={manualEntry.carbs}
                    onChangeText={(val) => {
                      setManualEntry({ ...manualEntry, carbs: val });
                      if (selectedFood) setBaseNutrition(null);
                    }}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#A78BFA' }]}>🥑 Fat (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput, selectedFood && styles.inputCalculated]}
                    value={manualEntry.fats}
                    onChangeText={(val) => {
                      setManualEntry({ ...manualEntry, fats: val });
                      if (selectedFood) setBaseNutrition(null);
                    }}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#8E44AD' }]}>🥬 Fiber (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput, selectedFood && styles.inputCalculated]}
                    value={manualEntry.fiber}
                    onChangeText={(val) => {
                      setManualEntry({ ...manualEntry, fiber: val });
                      if (selectedFood) setBaseNutrition(null);
                    }}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.macroInputGroupManual, { flex: 2 }]}>
                  <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>⚡ Net Carbs (calculated)</Text>
                  <View style={[styles.input, styles.macroInput, styles.inputDisabled]}>
                    <Text style={styles.inputDisabledText}>
                      {calculateNetCarbs(manualEntry.carbs, manualEntry.fiber)}g
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            {(manualEntry.description || manualEntry.calories) && (
              <View style={styles.manualSection}>
                <Text style={styles.sectionTitle}>👁️ Preview</Text>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.entryMealBadge}>
                      <Text style={styles.entryMealIcon}>{selectedMeal?.icon}</Text>
                      <Text style={styles.entryMealName}>{selectedMeal?.name}</Text>
                    </View>
                    <Text style={styles.previewDateTime}>
                      {manualEntry.date} • {manualEntry.time}
                    </Text>
                  </View>
                  <Text style={styles.previewDescription}>
                    {manualEntry.description || 'No description'}
                    {selectedFood && manualEntry.servings !== '1' && (
                      <Text style={styles.previewServings}> ({manualEntry.servings} servings)</Text>
                    )}
                  </Text>
                  <View style={styles.previewMacros}>
                    <Text style={styles.previewMacro}>
                      🔥 {manualEntry.calories || '0'} kcal
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#FFE66D' }]}>
                      🍞 {manualEntry.carbs || '0'}g C
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#4ECDC4' }]}>
                      ⚡ {calculateNetCarbs(manualEntry.carbs, manualEntry.fiber)}g NC
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#8E44AD' }]}>
                      🥬 {manualEntry.fiber || '0'}g
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#FF6B6B' }]}>
                      💪 {manualEntry.proteins || '0'}g
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#A78BFA' }]}>
                      🥑 {manualEntry.fats || '0'}g
                    </Text>
                  </View>
                </View>
              </View>
            )}
            {/* Save as Favorite Option */}
            {manualEntry.description && manualEntry.calories && (
              <TouchableOpacity
                style={styles.saveAsFavoriteButton}
                onPress={handleSaveAsFavorite}
                disabled={isSaving}
              >
                <Text style={styles.saveAsFavoriteText}>
                  ⭐ Save as {selectedMeal?.name} Favorite
                </Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={handleSaveManualEntry}
              disabled={isSaving}
            >
              <LinearGradient colors={['#9B59B6', '#8E44AD']} style={styles.bottomButtonGradient}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bottomButtonText}>💾 Save Entry</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // EDIT ENTRY SCREEN
  // ==========================================================================
  if (screen === 'edit' && editingEntry) {
    const currentMeal = MEAL_TYPES.find(m => m.id === editingEntry.mealId);
    
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <TouchableOpacity style={styles.backButton} onPress={handleCancelEdit}>
                <Text style={styles.backButtonText}>← Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.screenTitle}>✏️ Edit Entry</Text>
              <Text style={styles.screenSubtitle}>
                Modify your food entry
              </Text>
            </View>

            {/* Meal Type Selector */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>🍽️ Meal Type</Text>
              <View style={styles.mealSelectorSmall}>
                {MEAL_TYPES.map(meal => (
                  <TouchableOpacity
                    key={meal.id}
                    style={[
                      styles.mealOptionSmall,
                      editingEntry.mealId === meal.id && { borderColor: meal.color, borderWidth: 2, backgroundColor: meal.color + '30' }
                    ]}
                    onPress={() => setEditingEntry({ ...editingEntry, mealId: meal.id })}
                  >
                    <Text style={styles.mealOptionSmallIcon}>{meal.icon}</Text>
                    <Text style={[
                      styles.mealOptionSmallName,
                      editingEntry.mealId === meal.id && { color: meal.color }
                    ]}>{meal.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date & Time Section */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>📅 Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={editingEntry.date}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, date: val })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.inputLabel}>Time</Text>
                  <TextInput
                    style={styles.input}
                    value={editingEntry.time}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, time: val })}
                    placeholder="HH:MM"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>
            </View>

            {/* Food Description Section */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>🍽️ Food Details</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Food Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editingEntry.description}
                  onChangeText={(val) => setEditingEntry({ ...editingEntry, description: val })}
                  placeholder="e.g., Grilled chicken breast with rice and vegetables"
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Nutrition Section */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>📊 Nutrition Information</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🔥 Calories *</Text>
                <TextInput
                  style={styles.input}
                  value={editingEntry.calories}
                  onChangeText={(val) => setEditingEntry({ ...editingEntry, calories: val })}
                  placeholder="e.g., 450"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>💪 Protein (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={editingEntry.proteins}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, proteins: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🍞 Carbs (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={editingEntry.carbs}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, carbs: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#A78BFA' }]}>🥑 Fat (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={editingEntry.fats}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, fats: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.macroInputRow}>
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#8E44AD' }]}>🥬 Fiber (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={editingEntry.fiber}
                    onChangeText={(val) => setEditingEntry({ ...editingEntry, fiber: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.macroInputGroupManual, { flex: 2 }]}>
                  <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>⚡ Net Carbs (calculated)</Text>
                  <View style={[styles.input, styles.macroInput, styles.inputDisabled]}>
                    <Text style={styles.inputDisabledText}>
                      {calculateNetCarbs(editingEntry.carbs, editingEntry.fiber)}g
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Number of Servings */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>🔢 Number of Servings</Text>
              <View style={styles.servingsContainer}>
                <TouchableOpacity
                  style={styles.servingsButton}
                  onPress={() => {
                    const current = parseFloat(editEntryServings) || 1;
                    if (current > 0.5) {
                      handleEditEntryServingsChange(String(Math.round((current - 0.5) * 10) / 10));
                    }
                  }}
                >
                  <Text style={styles.servingsButtonText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.servingsInput}
                  value={editEntryServings}
                  onChangeText={handleEditEntryServingsChange}
                  keyboardType="decimal-pad"
                  textAlign="center"
                />
                <TouchableOpacity
                  style={styles.servingsButton}
                  onPress={() => {
                    const current = parseFloat(editEntryServings) || 1;
                    handleEditEntryServingsChange(String(Math.round((current + 0.5) * 10) / 10));
                  }}
                >
                  <Text style={styles.servingsButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.servingsQuickButtons}>
                {[0.5, 1, 1.5, 2, 3].map(val => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.servingsQuickButton,
                      parseFloat(editEntryServings) === val && styles.servingsQuickButtonActive
                    ]}
                    onPress={() => handleEditEntryServingsChange(String(val))}
                  >
                    <Text style={[
                      styles.servingsQuickButtonText,
                      parseFloat(editEntryServings) === val && styles.servingsQuickButtonTextActive
                    ]}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editEntryServings !== '1' && baseEditEntryNutrition && (
                <Text style={styles.servingsNote}>
                  Base serving: {baseEditEntryNutrition.calories} kcal
                </Text>
              )}
            </View>

            {/* Save as Favorite Option */}
            {editingEntry.description && editingEntry.calories && (
              <TouchableOpacity
                style={styles.saveAsFavoriteButton}
                onPress={handleSaveEditingEntryAsFavorite}
                disabled={isSaving}
              >
                <Text style={styles.saveAsFavoriteText}>
                  ⭐ Save as {MEAL_TYPES.find(m => m.id === editingEntry.mealId)?.name || 'Meal'} Favorite
                </Text>
              </TouchableOpacity>
            )}

            {/* Delete Button */}
            <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteEntry}>
              <Text style={styles.deleteButtonText}>🗑️ Delete Entry</Text>
            </TouchableOpacity>

            {/* Spacer for bottom buttons */}
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom Action Buttons */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.bottomButton, styles.bottomButtonSecondary]}
              onPress={handleCancelEdit}
            >
              <Text style={styles.bottomButtonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={handleSaveEditedEntry}
              disabled={isSaving}
            >
              <LinearGradient colors={['#4ECDC4', '#2ECC71']} style={styles.bottomButtonGradient}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bottomButtonText}>💾 Save Changes</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // CAMERA SCREEN
  // ==========================================================================
  if (screen === 'camera') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.backButtonCamera} onPress={resetToHome}>
                <Text style={styles.backButtonCameraText}>← Back</Text>
              </TouchableOpacity>
              <View style={styles.cameraHeaderCenter}>
                <Text style={styles.cameraModeTitle}>{selectedMeal?.icon} {selectedMeal?.name}</Text>
                <Text style={styles.cameraModeSubtitle}>Photo Mode</Text>
              </View>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.frameGuide}>
              <View style={styles.frameCorner} />
              <View style={[styles.frameCorner, styles.frameCornerTR]} />
              <View style={[styles.frameCorner, styles.frameCornerBL]} />
              <View style={[styles.frameCorner, styles.frameCornerBR]} />
            </View>

            <View style={styles.cameraControls}>
              <Text style={styles.instructionText}>Position your plate within the frame</Text>
              <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                <LinearGradient colors={['#FF6B6B', '#FF8E53']} style={styles.captureButtonInner}>
                  <View style={styles.captureButtonCore} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ==========================================================================
  // BARCODE SCANNER SCREEN
  // ==========================================================================
  if (screen === 'barcode') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
          }}
          onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
        >
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.backButtonCamera} onPress={resetToHome}>
                <Text style={styles.backButtonCameraText}>← Back</Text>
              </TouchableOpacity>
              <View style={styles.cameraHeaderCenter}>
                <Text style={styles.cameraModeTitle}>{selectedMeal?.icon} {selectedMeal?.name}</Text>
                <Text style={styles.cameraModeSubtitle}>Barcode Scanner</Text>
              </View>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.barcodeFrameContainer}>
              <View style={styles.barcodeFrame}>
                <View style={[styles.barcodeCorner, styles.barcodeCornerTL]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerTR]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerBL]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerBR]} />
                <View style={styles.scanLine} />
              </View>
            </View>

            <View style={styles.cameraControls}>
              <View style={styles.barcodeInstructions}>
                <Text style={styles.barcodeIcon}>📊</Text>
                <Text style={styles.instructionText}>Align barcode within the frame</Text>
              </View>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ==========================================================================
  // RESULTS SCREEN
  // ==========================================================================
  return (
    <SafeAreaView style={styles.resultsContainer}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.resultsGradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.resultsHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.resultsTitle}>
              {selectedMeal?.icon} {selectedMeal?.name}
            </Text>
            {scannedBarcode && (
              <Text style={styles.barcodeNumber}>UPC: {scannedBarcode}</Text>
            )}
          </View>

          {/* Captured Image */}
          {capturedImage && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: capturedImage.uri }} style={styles.capturedImage} />
              {isAnalyzing && (
                <BlurView intensity={80} style={styles.analyzingOverlay}>
                  <ActivityIndicator size="large" color="#FF6B6B" />
                  <Text style={styles.analyzingText}>Analyzing your meal...</Text>
                </BlurView>
              )}
            </View>
          )}

          {/* Product Image (barcode) */}
          {scanMode === 'barcode' && analysisResult?.imageUrl && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: analysisResult.imageUrl }} style={styles.productImage} resizeMode="contain" />
            </View>
          )}

          {/* Loading for barcode */}
          {scanMode === 'barcode' && isAnalyzing && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#4ECDC4" />
              <Text style={styles.loadingText}>Looking up product...</Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={resetToHome}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Results */}
          {analysisResult && !error && (
            <>
              {/* Editable Description for Photo Mode */}
              {scanMode === 'photo' && (
                <View style={styles.manualSection}>
                  <Text style={styles.sectionTitle}>📝 Description</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={analysisResult.mealDescription || ''}
                    onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, mealDescription: val }))}
                    placeholder="Describe your meal..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              )}

              {/* Non-editable description for barcode */}
              {scanMode === 'barcode' && analysisResult.mealDescription && (
                <View style={styles.mealDescriptionContainer}>
                  <Text style={styles.mealDescription}>{analysisResult.mealDescription}</Text>
                  {analysisResult.nutriscore && <NutriscoreBadge grade={analysisResult.nutriscore} />}
                </View>
              )}

              {/* Number of Servings - Barcode only */}
              {scanMode === 'barcode' && (
                <View style={styles.manualSection}>
                  <Text style={styles.sectionTitle}>🔢 Number of Servings</Text>
                  <View style={styles.servingsContainer}>
                    <TouchableOpacity
                      style={styles.servingsButton}
                      onPress={() => {
                        const current = parseFloat(barcodeServings) || 1;
                        if (current > 0.5) {
                          handleBarcodeServingsChange(String(Math.round((current - 0.5) * 10) / 10));
                        }
                      }}
                    >
                      <Text style={styles.servingsButtonText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.servingsInput}
                      value={barcodeServings}
                      onChangeText={handleBarcodeServingsChange}
                      keyboardType="decimal-pad"
                      textAlign="center"
                    />
                    <TouchableOpacity
                      style={styles.servingsButton}
                      onPress={() => {
                        const current = parseFloat(barcodeServings) || 1;
                        handleBarcodeServingsChange(String(Math.round((current + 0.5) * 10) / 10));
                      }}
                    >
                      <Text style={styles.servingsButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.servingsQuickButtons}>
                    {[0.5, 1, 1.5, 2, 3].map(val => (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.servingsQuickButton,
                          parseFloat(barcodeServings) === val && styles.servingsQuickButtonActive
                        ]}
                        onPress={() => handleBarcodeServingsChange(String(val))}
                      >
                        <Text style={[
                          styles.servingsQuickButtonText,
                          parseFloat(barcodeServings) === val && styles.servingsQuickButtonTextActive
                        ]}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {barcodeServings !== '1' && baseBarcodeNutrition && (
                    <Text style={styles.servingsNote}>
                      Base serving: {baseBarcodeNutrition.calories} kcal
                    </Text>
                  )}
                </View>
              )}

              {/* Editable Nutrition for Photo Mode */}
              {scanMode === 'photo' && (
                <View style={styles.manualSection}>
                  <Text style={styles.sectionTitle}>🍽️ Nutrition (tap to edit)</Text>
                  <View style={styles.macroInputRow}>
                    <View style={styles.macroInputGroupManual}>
                      <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>🔥 Calories</Text>
                      <TextInput
                        style={[styles.input, styles.macroInput]}
                        value={String(analysisResult.totalCalories || '')}
                        onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, totalCalories: parseInt(val) || 0 }))}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.macroInputGroupManual}>
                      <Text style={[styles.inputLabel, { color: '#FF6B6B' }]}>💪 Protein (g)</Text>
                      <TextInput
                        style={[styles.input, styles.macroInput]}
                        value={String(analysisResult.totalProtein || '')}
                        onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, totalProtein: parseFloat(val) || 0 }))}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <View style={styles.macroInputRow}>
                    <View style={styles.macroInputGroupManual}>
                      <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🍞 Carbs (g)</Text>
                      <TextInput
                        style={[styles.input, styles.macroInput]}
                        value={String(analysisResult.totalCarbs || '')}
                        onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, totalCarbs: parseFloat(val) || 0 }))}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.macroInputGroupManual}>
                      <Text style={[styles.inputLabel, { color: '#A78BFA' }]}>🥑 Fat (g)</Text>
                      <TextInput
                        style={[styles.input, styles.macroInput]}
                        value={String(analysisResult.totalFat || '')}
                        onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, totalFat: parseFloat(val) || 0 }))}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <View style={styles.macroInputRow}>
                    <View style={styles.macroInputGroupManual}>
                      <Text style={[styles.inputLabel, { color: '#8E44AD' }]}>🌾 Fiber (g)</Text>
                      <TextInput
                        style={[styles.input, styles.macroInput]}
                        value={String(analysisResult.totalFiber || '')}
                        onChangeText={(val) => setAnalysisResult(prev => ({ ...prev, totalFiber: parseFloat(val) || 0 }))}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={[styles.macroInputGroupManual, { flex: 2 }]}>
                      <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>⚡ Net Carbs (calculated)</Text>
                      <View style={[styles.input, styles.macroInput, styles.inputDisabled]}>
                        <Text style={styles.inputDisabledText}>
                          {Math.max(0, (analysisResult.totalCarbs || 0) - (analysisResult.totalFiber || 0))}g
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Read-only MacroCards for Barcode Mode */}
              {scanMode === 'barcode' && (
                <View style={styles.macroSummary}>
                  <MacroCard label="Calories" value={analysisResult.totalCalories} unit="kcal" color="#FF6B6B" icon="🔥" delay={0} />
                  <MacroCard label="Protein" value={analysisResult.totalProtein} unit="g" color="#FF6B6B" icon="💪" delay={100} />
                  <MacroCard label="Carbs" value={analysisResult.totalCarbs || 0} unit="g" color="#FFE66D" icon="🍞" delay={200} />
                  <MacroCard label="Net Carbs" value={Math.max(0, (analysisResult.totalCarbs || 0) - (analysisResult.totalFiber || 0))} unit="g" color="#4ECDC4" icon="⚡" delay={300} />
                  <MacroCard label="Fiber" value={analysisResult.totalFiber || 0} unit="g" color="#8E44AD" icon="🌾" delay={400} />
                  <MacroCard label="Fat" value={analysisResult.totalFat} unit="g" color="#A78BFA" icon="🥑" delay={500} />
                </View>
              )}

              {/* Food items detected - only show for photo mode */}
              {scanMode === 'photo' && analysisResult.foods?.length > 0 && (
                <View style={styles.foodItemsSection}>
                  <Text style={styles.sectionTitle}>Food Items Detected</Text>
                  {analysisResult.foods.map((item, index) => (
                    <FoodItemCard key={index} item={item} index={index} />
                  ))}
                </View>
              )}

              {/* Nutrition facts for barcode mode */}
              {scanMode === 'barcode' && (
                <View style={styles.foodItemsSection}>
                  <Text style={styles.sectionTitle}>Nutrition Facts</Text>
                  {analysisResult.foods?.map((item, index) => (
                    <FoodItemCard key={index} item={item} index={index} />
                  ))}
                </View>
              )}

              {analysisResult.ingredients && (
                <View style={styles.ingredientsSection}>
                  <Text style={styles.sectionTitle}>Ingredients</Text>
                  <View style={styles.ingredientsCard}>
                    <Text style={styles.ingredientsText}>{analysisResult.ingredients}</Text>
                  </View>
                </View>
              )}

              {/* Save as Favorite Option */}
              <TouchableOpacity
                style={styles.saveAsFavoriteButton}
                onPress={handleSaveAnalysisAsFavorite}
                disabled={isSaving}
              >
                <Text style={styles.saveAsFavoriteText}>
                  ⭐ Save as {selectedMeal?.name} Favorite
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {/* Bottom Actions */}
        {analysisResult && !isAnalyzing && !error && (
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.bottomButton, styles.bottomButtonSecondary]}
              onPress={() => {
                if (scanMode === 'photo') {
                  setCapturedImage(null);
                  setAnalysisResult(null);
                } else {
                  setScannedBarcode(null);
                  setAnalysisResult(null);
                  setBaseBarcodeNutrition(null);
                  setBarcodeServings('1');
                  setIsScanning(true);
                }
                goBack();
              }}
            >
              <Text style={styles.bottomButtonSecondaryText}>
                {scanMode === 'photo' ? '📸 Retake' : '📊 Scan Again'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.bottomButton} 
              onPress={handleSaveEntry}
              disabled={isSaving}
            >
              <LinearGradient colors={['#4ECDC4', '#2ECC71']} style={styles.bottomButtonGradient}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bottomButtonText}>✓ Save Entry</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  logoutButton: {
    marginTop: 30,
    marginBottom: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  screenGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  homeScrollContent: {
    paddingBottom: 100,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  nameInputGroup: {
    flex: 1,
  },
  ageInputGroup: {
    flex: 0.35,
  },
  heightInputGroup: {
    flex: 0.65,
  },
  heightInput: {
    flex: 1,
    minWidth: 60,
  },

  // Permission Screen
  permissionContainer: { flex: 1 },
  permissionGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  permissionIcon: { fontSize: 80, marginBottom: 30 },
  permissionTitle: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 16, textAlign: 'center' },
  permissionText: { fontSize: 16, color: '#a0a0a0', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  permissionButton: { borderRadius: 30, overflow: 'hidden' },
  permissionButtonGradient: { paddingVertical: 16, paddingHorizontal: 40 },
  permissionButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  // Session Expired Modal
  sessionExpiredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sessionExpiredModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  sessionExpiredIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  sessionExpiredTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  sessionExpiredMessage: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  sessionExpiredNote: {
    fontSize: 14,
    color: '#4ECDC4',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  sessionExpiredButton: {
    borderRadius: 30,
    overflow: 'hidden',
    width: '100%',
  },
  sessionExpiredButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  sessionExpiredButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(26, 26, 46, 0.98)',
    paddingBottom: Platform.OS === 'android' ? 50 : 25,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {},
  tabIcon: { fontSize: 24, marginBottom: 4 },
  tabLabel: { fontSize: 12, color: '#666' },
  tabLabelActive: { color: '#FF6B6B', fontWeight: '600' },

  // Screen Header
  screenHeader: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 25 : 10,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },

  // Date Navigation
  dateNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 8,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavButtonDisabled: {
    opacity: 0.3,
  },
  dateNavButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
  },
  dateNavButtonTextDisabled: {
    color: '#666',
  },
  dateNavCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateNavDateText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  dateNavFullDate: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 2,
  },
  goToTodayHint: {
    fontSize: 11,
    color: '#4ECDC4',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Home Screen
  homeHeader: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 20,
  },
  homeTitle: {
    fontSize: 38,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  homeSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 6,
  },

  // Compact Home Screen (No Scroll)
  homeContentNoScroll: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
  },
  homeHeaderCompact: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  homeTitleCompact: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  homeSubtitleCompact: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  dateNavContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 6,
    marginBottom: 10,
  },
  dateNavButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavCenterCompact: {
    flex: 1,
    alignItems: 'center',
  },
  dateNavDateTextCompact: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dateNavFullDateCompact: {
    fontSize: 11,
    color: '#a0a0a0',
  },
  quickStatsCompact: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  quickStatsTitleCompact: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  quickStatsRowCompact: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  quickStatsValueCompact: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FF6B6B',
  },
  quickStatsLabelCompact: {
    fontSize: 14,
    color: '#a0a0a0',
    marginLeft: 6,
  },
  quickStatsMacrosCompact: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  quickStatsMacroCompact: {
    fontSize: 11,
    fontWeight: '600',
  },
  mealSelectorLargeWrapper: {
    marginBottom: 12,
  },
  mealSelectorPrompt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  mealGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mealOptionLarge: {
    width: '48%',
    aspectRatio: 1.6,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mealOptionGradientLarge: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  mealOptionIconLarge: {
    fontSize: 36,
    marginBottom: 4,
  },
  mealOptionNameLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  logWeightButtonWide: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  logWeightButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logWeightButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  logWeightButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Action Buttons Grid (2x2)
  actionButtonsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  actionButtonHalf: {
    width: '48%',
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  actionButtonIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  modeSelectContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  inputDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
  },
  inputDisabledText: {
    color: '#4ECDC4',
    fontSize: 16,
    fontWeight: '600',
  },

  // Quick Stats
  quickStats: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  quickStatsTitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  quickStatsValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FF6B6B',
  },
  quickStatsLabel: {
    fontSize: 16,
    color: '#a0a0a0',
    marginLeft: 8,
  },
  quickStatsMacros: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  quickStatsMacro: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Meal Selector
  mealSelectorContainer: {
    marginBottom: 24,
  },
  mealSelectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  mealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mealOption: {
    width: '48%',
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  mealOptionGradient: {
    padding: 20,
    alignItems: 'center',
  },
  mealOptionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  mealOptionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Mode Buttons
  modeButtonsContainer: {
    marginTop: 8,
  },
  modeButtonsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  modeButtonsDateHint: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F39C12',
  },
  modeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modeButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeButtonIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  modeButtonTextContainer: {
    flex: 1,
  },
  modeButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  modeButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Profile Screen
  profileSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  weightInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weightInput: {
    flex: 1,
  },
  unitToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 4,
  },
  unitToggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  unitToggleButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  unitToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a0a0',
  },
  unitToggleTextActive: {
    color: '#fff',
  },
  macroHint: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  macroInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroInputGroup: {
    flex: 1,
    marginHorizontal: 4,
  },
  macroInput: {
    textAlign: 'center',
  },
  
  // Manual Entry Screen
  manualSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateTimeGroup: {
    flex: 1,
  },
  textArea: {
    height: 80,
    paddingTop: 14,
  },
  macroInputGroupManual: {
    flex: 1,
    marginHorizontal: 4,
  },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#9B59B6',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewDateTime: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  previewDescription: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 12,
    lineHeight: 22,
  },
  previewMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  previewMacro: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  
  // Edit Screen Styles
  mealSelectorSmall: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mealOptionSmall: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mealOptionSmallIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  mealOptionSmallName: {
    fontSize: 11,
    color: '#a0a0a0',
    fontWeight: '600',
  },
  deleteButton: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
  },
  
  macroTotalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  macroTotalLabel: {
    fontSize: 16,
    color: '#a0a0a0',
    marginRight: 8,
  },
  macroTotalValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  targetDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  targetItem: {
    alignItems: 'center',
  },
  targetValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  targetLabel: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 4,
  },
  profileButton: {
    marginHorizontal: 20,
    borderRadius: 25,
    overflow: 'hidden',
    marginBottom: 20,
  },
  profileButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  profileButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  // Today Screen
  caloriesCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  caloriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  caloriesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  caloriesRemaining: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  caloriesProgress: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  caloriesConsumed: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FF6B6B',
  },
  caloriesTarget: {
    fontSize: 18,
    color: '#a0a0a0',
    marginLeft: 8,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  macrosProgressContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 24,
  },
  macroProgressCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 8,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  macroProgressIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  macroProgressLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    marginBottom: 2,
    textAlign: 'center',
  },
  macroProgressValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  macroProgressTarget: {
    fontSize: 10,
    color: '#666',
    marginBottom: 6,
  },
  macroProgressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  macroProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  macroProgressPercent: {
    fontSize: 10,
    color: '#a0a0a0',
  },

  todayEntriesSection: {
    marginHorizontal: 20,
  },
  editHint: {
    fontSize: 13,
    color: '#a0a0a0',
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  entryCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  entryCardContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  entryCardMain: {
    flex: 1,
    padding: 16,
  },
  entryActions: {
    flexDirection: 'column',
  },
  entryEditButton: {
    backgroundColor: 'rgba(243, 156, 18, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  entryEditText: {
    fontSize: 18,
  },
  entryDeleteButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flex: 1,
  },
  entryDeleteText: {
    fontSize: 18,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editIcon: {
    fontSize: 14,
    opacity: 0.6,
  },
  entryMealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  entryMealIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  entryMealName: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  entryTime: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  entryDescription: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 10,
  },
  entryMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryMacro: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },

  // Camera Styles
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'transparent' },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButtonCamera: { padding: 8 },
  backButtonCameraText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cameraHeaderCenter: { alignItems: 'center' },
  cameraModeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cameraModeSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  frameGuide: { flex: 1, margin: 40, position: 'relative' },
  frameCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#FF6B6B',
    borderTopWidth: 3,
    borderLeftWidth: 3,
    top: 0,
    left: 0,
  },
  frameCornerTR: { borderLeftWidth: 0, borderRightWidth: 3, left: undefined, right: 0 },
  frameCornerBL: { borderTopWidth: 0, borderBottomWidth: 3, top: undefined, bottom: 0 },
  frameCornerBR: {
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    top: undefined,
    left: undefined,
    bottom: 0,
    right: 0,
  },
  cameraControls: { paddingBottom: 40, alignItems: 'center' },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: { flex: 1, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  captureButtonCore: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

  // Barcode Scanner
  barcodeFrameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  barcodeFrame: { width: 280, height: 160, position: 'relative' },
  barcodeCorner: { position: 'absolute', width: 30, height: 30, borderColor: '#4ECDC4' },
  barcodeCornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  barcodeCornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  barcodeCornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  barcodeCornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: '50%',
    height: 2,
    backgroundColor: '#4ECDC4',
  },
  barcodeInstructions: { alignItems: 'center', paddingHorizontal: 40 },
  barcodeIcon: { fontSize: 32, marginBottom: 12 },

  // Results Screen
  resultsContainer: { flex: 1, backgroundColor: '#1a1a2e' },
  resultsGradient: { flex: 1 },
  resultsHeader: { padding: 20, paddingTop: 10 },
  backButton: { marginBottom: 10, paddingVertical: 8, paddingRight: 16 },
  backButtonText: { color: '#FF6B6B', fontSize: 16, fontWeight: '600' },
  resultsTitle: { fontSize: 28, fontWeight: '800', color: '#fff' },
  barcodeNumber: { fontSize: 14, color: '#a0a0a0', marginTop: 4, fontFamily: 'monospace' },
  imageContainer: { marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  capturedImage: { width: '100%', height: 220, resizeMode: 'cover' },
  productImage: { width: '100%', height: 180, backgroundColor: '#fff' },
  analyzingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  analyzingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
  loadingCard: {
    margin: 20,
    padding: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    alignItems: 'center',
  },
  loadingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
  errorContainer: {
    margin: 20,
    padding: 24,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 16,
    alignItems: 'center',
  },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorText: { color: '#FF6B6B', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#FF6B6B', borderRadius: 20 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  mealDescriptionContainer: {
    margin: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  mealDescription: { color: '#fff', fontSize: 16, lineHeight: 24, fontStyle: 'italic' },
  nutriscoreBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 12 },
  nutriscoreText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  macroSummary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 20 },
  macroCard: { width: (SCREEN_WIDTH - 48) / 2, marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  macroGradient: { padding: 16, alignItems: 'center' },
  macroIcon: { fontSize: 28, marginBottom: 8 },
  macroValue: { fontSize: 32, fontWeight: '800' },
  macroUnit: { fontSize: 14, color: '#a0a0a0', marginTop: 2 },
  macroLabel: { fontSize: 14, color: '#fff', fontWeight: '600', marginTop: 4 },
  foodItemsSection: { marginTop: 24, paddingHorizontal: 20 },
  foodItemCard: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 16, padding: 16, marginBottom: 12 },
  foodItemHeader: { marginBottom: 12 },
  foodItemName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  foodItemPortion: { fontSize: 14, color: '#a0a0a0', marginTop: 4 },
  foodItemMacros: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniMacro: { alignItems: 'center', flex: 1 },
  miniMacroValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  miniMacroLabel: { fontSize: 11, color: '#a0a0a0', marginTop: 2 },
  miniMacroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  ingredientsSection: { marginTop: 24, paddingHorizontal: 20 },
  ingredientsCard: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, padding: 16 },
  ingredientsText: { color: '#a0a0a0', fontSize: 14, lineHeight: 22 },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 30,
    gap: 12,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
  },
  bottomButton: { flex: 1, borderRadius: 25, overflow: 'hidden' },
  bottomButtonGradient: { paddingVertical: 16, alignItems: 'center' },
  bottomButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottomButtonSecondary: { backgroundColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
  bottomButtonSecondaryText: { color: '#fff', fontSize: 16, fontWeight: '600', paddingVertical: 16 },

  // Progress Ring (unused but kept for potential use)
  progressRing: { alignItems: 'center', justifyContent: 'center' },
  progressRingInner: { alignItems: 'center' },
  progressValue: { fontSize: 18, fontWeight: '700' },
  progressUnit: { fontSize: 10, color: '#a0a0a0' },
  progressLabel: { fontSize: 12, color: '#a0a0a0', marginTop: 4 },
  progressBar: { width: '100%', height: 4, borderRadius: 2, marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 2 },

  // Food Search Screen Styles
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  searchInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  searchButton: {
    backgroundColor: '#9B59B6',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manualEntryLink: {
    marginTop: 12,
    alignItems: 'center',
  },
  manualEntryLinkText: {
    color: '#9B59B6',
    fontSize: 14,
    fontWeight: '500',
  },
  searchResultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  searchingText: {
    color: '#a0a0a0',
    fontSize: 16,
    marginTop: 16,
  },
  searchResultsTitle: {
    color: '#a0a0a0',
    fontSize: 14,
    marginBottom: 12,
  },
  foodResultCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  foodResultHeader: {
    marginBottom: 8,
  },
  foodResultName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  foodResultBrand: {
    color: '#9B59B6',
    fontSize: 13,
    marginTop: 2,
  },
  foodResultServing: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 10,
  },
  foodResultMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foodResultMacro: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  noResultsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noResultsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noResultsSubtext: {
    color: '#a0a0a0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  manualEntryButton: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#9B59B6',
  },
  manualEntryButtonText: {
    color: '#9B59B6',
    fontSize: 14,
    fontWeight: '600',
  },
  searchPromptContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  searchPromptIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  searchPromptText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  searchPromptSubtext: {
    color: '#a0a0a0',
    fontSize: 14,
    textAlign: 'center',
  },

  // Selected Food Banner
  selectedFoodBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(155, 89, 182, 0.15)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#9B59B6',
  },
  selectedFoodName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedFoodBrand: {
    color: '#9B59B6',
    fontSize: 13,
    marginTop: 2,
  },
  selectedFoodServing: {
    color: '#a0a0a0',
    fontSize: 12,
    marginTop: 6,
  },

  // Servings Input
  servingsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  servingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#9B59B6',
  },
  servingsButtonText: {
    color: '#9B59B6',
    fontSize: 24,
    fontWeight: '600',
  },
  servingsInput: {
    width: 80,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  servingsQuickButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  servingsQuickButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  servingsQuickButtonActive: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    borderColor: '#9B59B6',
  },
  servingsQuickButtonText: {
    color: '#a0a0a0',
    fontSize: 14,
    fontWeight: '500',
  },
  servingsQuickButtonTextActive: {
    color: '#9B59B6',
  },

  // Nutrition info notes
  nutritionServingNote: {
    color: '#9B59B6',
    fontSize: 12,
    fontWeight: '400',
  },
  inputCalculated: {
    borderColor: 'rgba(155, 89, 182, 0.3)',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
  },
  previewServings: {
    color: '#9B59B6',
    fontStyle: 'italic',
  },

  // Saved Meals Screen Styles
  savedMealsCount: {
    color: '#a0a0a0',
    fontSize: 14,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  savedMealCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(243, 156, 18, 0.2)',
  },
  savedMealContent: {
    flex: 1,
    padding: 16,
  },
  savedMealName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  savedMealMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  savedMealMacro: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  savedMealTapHint: {
    color: '#F39C12',
    fontSize: 11,
    fontStyle: 'italic',
  },
  savedMealActions: {
    flexDirection: 'column',
  },
  savedMealEditButton: {
    backgroundColor: 'rgba(243, 156, 18, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  savedMealEditText: {
    fontSize: 18,
  },
  savedMealDeleteButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  savedMealDeleteText: {
    fontSize: 18,
  },
  noSavedMealsContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  noSavedMealsIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  noSavedMealsText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  noSavedMealsSubtext: {
    color: '#a0a0a0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  noSavedMealsHint: {
    color: '#F39C12',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  goToSearchButton: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#9B59B6',
  },
  goToSearchButtonText: {
    color: '#9B59B6',
    fontSize: 14,
    fontWeight: '600',
  },

  // Save as Favorite Button
  saveAsFavoriteButton: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(243, 156, 18, 0.15)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(243, 156, 18, 0.3)',
  },
  saveAsFavoriteText: {
    color: '#F39C12',
    fontSize: 14,
    fontWeight: '600',
  },

  // Add Weight Button (Home Screen)
  addWeightButton: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.3)',
    overflow: 'hidden',
  },
  addWeightButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  addWeightButtonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  addWeightButtonText: {
    flex: 1,
  },
  addWeightButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  addWeightButtonSubtitle: {
    color: '#3498DB',
    fontSize: 13,
  },
  addWeightButtonArrow: {
    color: '#3498DB',
    fontSize: 20,
    fontWeight: '600',
  },

  // Weight Entry Screen Styles
  weightEntrySection: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  existingWeightBanner: {
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3498DB',
  },
  existingWeightText: {
    color: '#3498DB',
    fontSize: 14,
  },
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  weightEntryInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.3)',
  },
  weightUnitDisplay: {
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.3)',
  },
  weightUnitText: {
    color: '#3498DB',
    fontSize: 20,
    fontWeight: '700',
  },
  weightUnitHint: {
    color: '#a0a0a0',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
  },
  goalWeightReference: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.2)',
  },
  goalWeightTitle: {
    color: '#2ECC71',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  goalWeightValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  goalWeightDiff: {
    color: '#a0a0a0',
    fontSize: 14,
    marginTop: 4,
  },

  // Reports Button (Profile Screen)
  reportsButton: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Community Screen Styles
  postTypeFilterContainer: {
    maxHeight: 50,
    marginBottom: 10,
  },
  postTypeFilterContent: {
    paddingHorizontal: 16,
  },
  postTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  postTypeChipActive: {
    backgroundColor: 'rgba(231, 76, 60, 0.3)',
    borderWidth: 1,
    borderColor: '#E74C3C',
  },
  postTypeChipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  postTypeChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  postTypeChipTextActive: {
    color: '#fff',
  },
  communityPostCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(231, 76, 60, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  postAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  postAuthorName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  postTimestamp: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  postOwnerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postOwnerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postOwnerActionIcon: {
    fontSize: 16,
  },
  postTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  postTypeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  postTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  postContent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
  },
  postActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  postActionIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  postActionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: {
    fontSize: 24,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
  },
  postTypeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  postTypeSelectorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 10,
    marginBottom: 10,
  },
  postTypeSelectorOptionActive: {
    backgroundColor: 'rgba(231, 76, 60, 0.3)',
    borderWidth: 1,
    borderColor: '#E74C3C',
  },
  postTypeSelectorIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  postTypeSelectorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  postTypeSelectorTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  textAreaInput: {
    height: 150,
    paddingTop: 12,
  },
  primaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  viewPostCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  viewPostTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  viewPostContent: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  viewPostImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
  },
  commentsSection: {
    marginTop: 10,
  },
  commentsSectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  addCommentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginRight: 10,
  },
  commentSubmitButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  commentSubmitButtonDisabled: {
    backgroundColor: '#555',
  },
  commentSubmitText: {
    color: '#fff',
    fontWeight: '700',
  },
  noCommentsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  commentCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(155, 89, 182, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  commentInfo: {
    flex: 1,
  },
  commentAuthor: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  commentTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  commentContent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
  },

  // Diary Screen Styles
  diaryDateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  diaryDateNavButton: {
    padding: 8,
  },
  diaryDateNavText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
  diaryDateNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  diaryDateNavCenterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  diaryEditContainer: {
    paddingVertical: 10,
  },
  moodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  moodOption: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '18%',
  },
  moodOptionActive: {
    backgroundColor: 'rgba(39, 174, 96, 0.3)',
    borderWidth: 1,
    borderColor: '#27AE60',
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '500',
  },
  moodLabelActive: {
    color: '#fff',
  },
  diaryTextArea: {
    height: 200,
    paddingTop: 12,
  },
  diaryActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  diaryPrimaryButton: {
    flex: 1,
    maxWidth: 200,
  },
  diaryViewContainer: {
    paddingVertical: 10,
  },
  diaryViewCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
  },
  diaryMoodDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  diaryMoodEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  diaryMoodText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textTransform: 'capitalize',
  },
  diaryViewTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  diaryViewContent: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 20,
  },
  diaryViewTimestamp: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Reports Screen Styles
  reportsSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  reportCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  reportCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(155, 89, 182, 0.3)',
  },
  reportCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(155, 89, 182, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  reportCardEmoji: {
    fontSize: 24,
  },
  reportCardContent: {
    flex: 1,
  },
  reportCardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  reportCardDescription: {
    color: '#a0a0a0',
    fontSize: 13,
    lineHeight: 18,
  },
  reportCardArrow: {
    color: '#9B59B6',
    fontSize: 24,
    fontWeight: '600',
    marginLeft: 12,
  },
  comingSoonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
  },
  comingSoonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  comingSoonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  comingSoonSubtext: {
    color: '#a0a0a0',
    fontSize: 13,
    textAlign: 'center',
  },

  // Macro vs Weight Report Styles
  dateRangeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  dateRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateRangeButtonActive: {
    backgroundColor: 'rgba(155, 89, 182, 0.3)',
    borderColor: '#9B59B6',
  },
  dateRangeButtonText: {
    color: '#a0a0a0',
    fontSize: 14,
    fontWeight: '600',
  },
  dateRangeButtonTextActive: {
    color: '#9B59B6',
  },
  reportLoadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 60,
  },
  reportLoadingText: {
    color: '#a0a0a0',
    fontSize: 14,
    marginTop: 16,
  },
  chartSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  chartTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartSubtitle: {
    color: '#a0a0a0',
    fontSize: 13,
    marginBottom: 16,
  },
  chartContainer: {
    marginTop: 8,
  },
  chartPlaceholder: {
    minHeight: 150,
  },
  simpleChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  weightBar: {
    width: '60%',
    backgroundColor: '#3498DB',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    color: '#666',
    fontSize: 9,
    marginTop: 4,
  },
  weightStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  weightStatItem: {
    alignItems: 'center',
  },
  weightStatLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 4,
  },
  weightStatValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  
  // Combined Chart Styles
  combinedChartLegend: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
  },
  legendBar: {
    width: 16,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 1,
    marginRight: 2,
  },
  legendLineDashed: {
    width: 16,
    height: 0,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginRight: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: {
    color: '#a0a0a0',
    fontSize: 11,
  },
  combinedChartContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  yAxisLeft: {
    width: 35,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  yAxisRight: {
    width: 35,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingLeft: 6,
  },
  yAxisLabel: {
    color: '#888',
    fontSize: 10,
  },
  chartArea: {
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  weightBarCombined: {
    position: 'absolute',
    backgroundColor: 'rgba(180, 180, 180, 0.6)',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  chartLineDashed: {
    position: 'absolute',
    height: 0,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  chartDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(26, 26, 46, 0.8)',
  },
  xAxisContainer: {
    flexDirection: 'row',
    marginTop: 6,
  },
  xAxisLabels: {
    position: 'relative',
    height: 30,
  },
  xAxisLabelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  xAxisLabel: {
    color: '#888',
    fontSize: 9,
    transform: [{ rotate: '-45deg' }],
  },
  xAxisTitle: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  yAxisTitles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  yAxisTitleLeft: {
    color: '#888',
    fontSize: 10,
  },
  yAxisTitleRight: {
    color: '#888',
    fontSize: 10,
  },
  
  // CSV Download Link Styles
  downloadCsvLink: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(155, 89, 182, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(155, 89, 182, 0.3)',
    alignItems: 'center',
    alignSelf: 'center',
  },
  downloadCsvText: {
    color: '#9B59B6',
    fontSize: 14,
    fontWeight: '600',
  },

  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noDataText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  noDataSubtext: {
    color: '#a0a0a0',
    fontSize: 13,
    textAlign: 'center',
  },
  macroSummaryContainer: {
    marginTop: 8,
  },
  macroLegend: {
    marginBottom: 20,
  },
  macroLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  macroLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  macroLegendLabel: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  macroLegendValue: {
    color: '#a0a0a0',
    fontSize: 14,
    fontWeight: '600',
  },
  macroTrendsContainer: {
    marginTop: 8,
  },
  macroTrendsTitle: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  macroTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  macroTrendLabel: {
    width: 60,
    fontSize: 11,
    fontWeight: '600',
  },
  macroTrendBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 30,
    gap: 2,
  },
  macroTrendBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 2,
  },
  insightsSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  insightsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  insightCard: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2ECC71',
  },
  insightText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 22,
  },

  // ==========================================================================
  // HEALTH INTEGRATIONS STYLES
  // ==========================================================================
  healthIntegrationsSection: {
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  healthIntegrationsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  healthIntegrationsSubtitle: {
    color: '#a0a0a0',
    fontSize: 13,
    marginBottom: 16,
  },
  healthProvidersList: {
    gap: 12,
  },
  healthProviderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  healthProviderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  healthProviderEmoji: {
    fontSize: 22,
  },
  healthProviderInfo: {
    flex: 1,
  },
  healthProviderName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  healthProviderDescription: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  healthProviderConnectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  healthProviderConnectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  healthProviderDisconnectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
  },
  healthProviderDisconnectText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },

  // ==========================================================================
  // CONSUMPTION VS BURNED REPORT STYLES
  // ==========================================================================
  consumptionBurnedSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#a0a0a0',
    fontSize: 11,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryUnit: {
    color: '#a0a0a0',
    fontSize: 10,
    marginTop: 2,
  },
  chartSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  chartSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  yAxisLabel: {
    color: '#888',
    fontSize: 10,
    textAlign: 'right',
  },
  xAxisLabel: {
    color: '#888',
    fontSize: 9,
  },
  xAxisTitle: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  averagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  averageItem: {
    alignItems: 'center',
    flex: 1,
  },
  averageLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 4,
  },
  averageValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  providerInfoSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  providerInfoText: {
    color: '#a0a0a0',
    fontSize: 12,
    fontStyle: 'italic',
  },
  connectProviderLink: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
  },
  connectProviderLinkText: {
    color: '#2ECC71',
    fontSize: 14,
    fontWeight: '600',
  },

  // ==========================================================================
  // COMMUNITY CREATE POST STYLES
  // ==========================================================================
  postContentInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 16,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  imagePreview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderStyle: 'dashed',
  },
  addPhotoButtonIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  addPhotoButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  postSubmitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  postSubmitButtonDisabled: {
    opacity: 0.6,
  },
  postSubmitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postSubmitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  // ==========================================================================
  // POST CAMERA STYLES
  // ==========================================================================
  cameraTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  cameraCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCloseButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  cameraFlipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFlipButtonText: {
    fontSize: 24,
  },
  cameraBottomBar: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 50,
  },
  cameraCaptureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  cameraCaptureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  cameraPermissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  cameraPermissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  cameraPermissionButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  cameraPermissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ==========================================================================
  // DIARY SIMPLIFIED STYLES
  // ==========================================================================
  diaryFreeformInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 300,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 20,
  },
  diarySaveButton: {
    flex: 1,
    maxWidth: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  diarySaveButtonDisabled: {
    opacity: 0.6,
  },
  diarySaveButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diarySaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
});
