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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================================================
// CONFIGURATION - Update these with your actual values
// =============================================================================
const API_CONFIG = {
  // Your backend API URL for database operations
  DATABASE_API_URL: 'https://your-api-endpoint.com/api',
  // Customer ID (in a real app, this would come from authentication)
  CUSTOMER_ID: 1,
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': Constants.expoConfig?.extra?.anthKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
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
                text: `Analyze this image of food and provide nutritional information. 
                
Please identify each food item visible and estimate:
1. The food item name
2. Approximate portion size
3. Estimated calories
4. Protein (in grams)
5. Carbohydrates (in grams)
6. Fat (in grams)

Respond ONLY with valid JSON in this exact format, no other text:
{
  "foods": [
    {
      "name": "Food Item Name",
      "portion": "portion description",
      "calories": 000,
      "protein": 00,
      "carbs": 00,
      "fat": 00
    }
  ],
  "totalCalories": 000,
  "totalProtein": 00,
  "totalCarbs": 00,
  "totalFat": 00,
  "mealDescription": "Brief description of the overall meal"
}

If this is not a food image, respond with:
{
  "error": "Could not identify food items in this image",
  "foods": [],
  "totalCalories": 0,
  "totalProtein": 0,
  "totalCarbs": 0,
  "totalFat": 0
}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      const text = data.content[0].text;
      const cleanedText = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedText);
    }
    throw new Error('Invalid response from API');
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

      return {
        found: true,
        productName: product.product_name || 'Unknown Product',
        brand: product.brands || '',
        servingSize: servingSize,
        imageUrl: product.image_url || product.image_front_url || null,
        foods: [{
          name: product.product_name || 'Unknown Product',
          portion: servingSize,
          calories, protein, carbs, fat,
        }],
        totalCalories: calories,
        totalProtein: protein,
        totalCarbs: carbs,
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
    const existingEntries = await AsyncStorage.getItem('food_entries');
    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    entries.push(newEntry);
    await AsyncStorage.setItem('food_entries', JSON.stringify(entries));
    
    return { success: true, entry: newEntry };
    
    /* 
    // Real API call would look like this:
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    });
    return await response.json();
    */
  } catch (error) {
    console.error('Error saving food entry:', error);
    throw error;
  }
};

// Database Service - Update food entry
const updateFoodEntry = async (entryId, updatedData) => {
  try {
    const existingEntries = await AsyncStorage.getItem('food_entries');
    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
    const index = entries.findIndex(e => e.food_entry_id === entryId);
    if (index === -1) {
      throw new Error('Entry not found');
    }
    
    entries[index] = {
      ...entries[index],
      food_entry_date: updatedData.date,
      food_entry_time: updatedData.time,
      food_entry_meal_id: updatedData.mealId,
      food_description: updatedData.description,
      food_calories: updatedData.calories,
      food_carbs: updatedData.carbs,
      food_proteins: updatedData.proteins,
      food_fats: updatedData.fats,
      updated_at: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem('food_entries', JSON.stringify(entries));
    
    return { success: true, entry: entries[index] };
    
    /* 
    // Real API call would look like this:
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries/${entryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData),
    });
    return await response.json();
    */
  } catch (error) {
    console.error('Error updating food entry:', error);
    throw error;
  }
};

// Database Service - Delete food entry
const deleteFoodEntry = async (entryId) => {
  try {
    const existingEntries = await AsyncStorage.getItem('food_entries');
    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    
    const filteredEntries = entries.filter(e => e.food_entry_id !== entryId);
    await AsyncStorage.setItem('food_entries', JSON.stringify(filteredEntries));
    
    return { success: true };
    
    /* 
    // Real API call would look like this:
    const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries/${entryId}`, {
      method: 'DELETE',
    });
    return await response.json();
    */
  } catch (error) {
    console.error('Error deleting food entry:', error);
    throw error;
  }
};

// Get today's food entries
const getTodayEntries = async () => {
  try {
    const existingEntries = await AsyncStorage.getItem('food_entries');
    const entries = existingEntries ? JSON.parse(existingEntries) : [];
    const today = new Date().toISOString().split('T')[0];
    
    return entries.filter(e => e.food_entry_date === today);
  } catch (error) {
    console.error('Error getting entries:', error);
    return [];
  }
};

// Profile Storage
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
          { val: `${item.carbs}g`, label: 'carbs', color: '#4ECDC4' },
          { val: `${item.fat}g`, label: 'fat', color: '#FFE66D' },
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
          <Text style={styles.modeButtonTitle}>{title}</Text>
          <Text style={styles.modeButtonSubtitle}>{subtitle}</Text>
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
  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState('home');
  const [screen, setScreen] = useState('main');
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
  });
  
  // Edit entry state
  const [editingEntry, setEditingEntry] = useState(null);
  
  // Profile state
  const [profile, setProfile] = useState({
    goalWeight: '',
    weightUnit: 'kg', // 'kg' or 'lbs'
    goalDate: '',
    targetCalories: '',
    carbsPercent: '50',
    proteinsPercent: '25',
    fatsPercent: '25',
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  // Today's tracking
  const [todayEntries, setTodayEntries] = useState([]);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0, carbs: 0, proteins: 0, fats: 0
  });
  
  const cameraRef = useRef(null);

  // Load profile and entries on mount
  useEffect(() => {
    loadProfile();
    loadTodayEntries();
  }, []);

  const loadProfile = async () => {
    const savedProfile = await getProfile();
    if (savedProfile) {
      setProfile(savedProfile);
    }
  };

  const loadTodayEntries = async () => {
    const entries = await getTodayEntries();
    setTodayEntries(entries);
    
    const totals = entries.reduce((acc, entry) => ({
      calories: acc.calories + (entry.food_calories || 0),
      carbs: acc.carbs + parseFloat(entry.food_carbs || 0),
      proteins: acc.proteins + parseFloat(entry.food_proteins || 0),
      fats: acc.fats + parseFloat(entry.food_fats || 0),
    }), { calories: 0, carbs: 0, proteins: 0, fats: 0 });
    
    setTodayTotals(totals);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodayEntries();
    setRefreshing(false);
  }, []);

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
    const carbsPct = parseInt(profile.carbsPercent) || 0;
    const proteinsPct = parseInt(profile.proteinsPercent) || 0;
    const fatsPct = parseInt(profile.fatsPercent) || 0;
    
    if (carbsPct + proteinsPct + fatsPct !== 100) {
      Alert.alert('Invalid Percentages', 'Carbs, Proteins, and Fats percentages must add up to 100%');
      return;
    }
    
    await saveProfile(profile);
    setIsEditingProfile(false);
    Alert.alert('Success', 'Profile saved successfully!');
  };

  // Handle saving food entry to database
  const handleSaveEntry = async () => {
    if (!analysisResult || !selectedMeal) return;
    
    setIsSaving(true);
    try {
      const now = new Date();
      const entry = {
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        mealId: selectedMeal.id,
        description: analysisResult.mealDescription || 'Food entry',
        image: capturedImage?.base64 || null,
        calories: analysisResult.totalCalories,
        carbs: analysisResult.totalCarbs,
        proteins: analysisResult.totalProtein,
        fats: analysisResult.totalFat,
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
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        setCapturedImage(manipulatedImage);
        setError(null);
        setScreen('results');
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
    setScreen('results');
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setError(null);

    try {
      const result = await lookupBarcode(data);
      if (!result.found) {
        setError(`Product not found for barcode: ${data}`);
      } else {
        setAnalysisResult(result);
      }
    } catch (err) {
      setError('Failed to look up product. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetToHome = () => {
    setScreen('main');
    setActiveTab('home');
    setCapturedImage(null);
    setAnalysisResult(null);
    setError(null);
    setScanMode(null);
    setScannedBarcode(null);
    setIsScanning(true);
    setSelectedMeal(null);
  };

  const goToCamera = () => {
    setScanMode('photo');
    setScreen('camera');
  };

  const goToBarcode = () => {
    setScanMode('barcode');
    setIsScanning(true);
    setScreen('barcode');
  };

  // Navigate to manual entry
  const goToManualEntry = () => {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    setManualEntry({
      date: currentDate,
      time: currentTime,
      description: '',
      calories: '',
      proteins: '',
      carbs: '',
      fats: '',
    });
    setScanMode('manual');
    setScreen('manual');
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
    setEditingEntry({
      id: entry.food_entry_id,
      date: entry.food_entry_date,
      time: entry.food_entry_time?.slice(0, 5) || '', // HH:MM format
      mealId: entry.food_entry_meal_id,
      description: entry.food_description || '',
      calories: String(entry.food_calories || ''),
      proteins: String(entry.food_proteins || ''),
      carbs: String(entry.food_carbs || ''),
      fats: String(entry.food_fats || ''),
    });
    setScreen('edit');
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
      };

      await updateFoodEntry(editingEntry.id, updatedData);
      await loadTodayEntries();

      Alert.alert('Success', 'Entry updated!', [
        { text: 'OK', onPress: () => {
          setEditingEntry(null);
          setScreen('main');
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
                  setScreen('main');
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

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingEntry(null);
    setScreen('main');
    setActiveTab('today');
  };

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
            NutriSnap needs camera access to analyze your food photos and scan barcodes.
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

  // ==========================================================================
  // PROFILE SCREEN
  // ==========================================================================
  if (activeTab === 'profile' && screen === 'main') {
    const targets = getTargets();
    
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 Profile</Text>
              <Text style={styles.screenSubtitle}>Your goals and targets</Text>
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
            >
              <LinearGradient
                colors={isEditingProfile ? ['#4ECDC4', '#2ECC71'] : ['#FF6B6B', '#FF8E53']}
                style={styles.profileButtonGradient}
              >
                <Text style={styles.profileButtonText}>
                  {isEditingProfile ? '💾 Save Profile' : '✏️ Edit Profile'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
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
              <Text style={styles.screenTitle}>📊 Today's Progress</Text>
              <Text style={styles.screenSubtitle}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>

            {/* Calories Progress */}
            <View style={styles.caloriesCard}>
              <View style={styles.caloriesHeader}>
                <Text style={styles.caloriesTitle}>🔥 Calories</Text>
                <Text style={styles.caloriesRemaining}>
                  {Math.max(targets.calories - todayTotals.calories, 0)} remaining
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
                { label: 'Carbs', consumed: todayTotals.carbs, target: targets.carbs, color: '#4ECDC4', icon: '⚡' },
                { label: 'Protein', consumed: todayTotals.proteins, target: targets.proteins, color: '#FF6B6B', icon: '💪' },
                { label: 'Fat', consumed: todayTotals.fats, target: targets.fats, color: '#FFE66D', icon: '🥑' },
              ].map((macro, index) => (
                <View key={index} style={styles.macroProgressCard}>
                  <Text style={styles.macroProgressIcon}>{macro.icon}</Text>
                  <Text style={styles.macroProgressLabel}>{macro.label}</Text>
                  <Text style={[styles.macroProgressValue, { color: macro.color }]}>
                    {Math.round(macro.consumed)}g
                  </Text>
                  <Text style={styles.macroProgressTarget}>/ {macro.target}g</Text>
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
                  <Text style={styles.macroProgressPercent}>
                    {getProgress(macro.consumed, macro.target)}%
                  </Text>
                </View>
              ))}
            </View>

            {/* Today's Entries */}
            <View style={styles.todayEntriesSection}>
              <Text style={styles.sectionTitle}>Today's Entries ({todayEntries.length})</Text>
              
              {todayEntries.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateIcon}>🍽️</Text>
                  <Text style={styles.emptyStateText}>No entries yet today</Text>
                  <Text style={styles.emptyStateSubtext}>Start tracking your meals!</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.editHint}>Tap an entry to edit</Text>
                  {todayEntries.map((entry, index) => {
                    const meal = MEAL_TYPES.find(m => m.id === entry.food_entry_meal_id);
                    return (
                      <TouchableOpacity 
                        key={entry.food_entry_id} 
                        style={styles.entryCard}
                        onPress={() => handleEditEntry(entry)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.entryHeader}>
                          <View style={styles.entryMealBadge}>
                            <Text style={styles.entryMealIcon}>{meal?.icon || '🍽️'}</Text>
                            <Text style={styles.entryMealName}>{meal?.name || 'Meal'}</Text>
                          </View>
                          <View style={styles.entryHeaderRight}>
                            <Text style={styles.entryTime}>{entry.food_entry_time?.slice(0, 5)}</Text>
                            <Text style={styles.editIcon}>✏️</Text>
                          </View>
                        </View>
                        <Text style={styles.entryDescription} numberOfLines={2}>
                          {entry.food_description}
                        </Text>
                        <View style={styles.entryMacros}>
                          <Text style={styles.entryMacro}>{entry.food_calories} kcal</Text>
                          <Text style={[styles.entryMacro, { color: '#4ECDC4' }]}>{entry.food_carbs}g C</Text>
                          <Text style={[styles.entryMacro, { color: '#FF6B6B' }]}>{entry.food_proteins}g P</Text>
                          <Text style={[styles.entryMacro, { color: '#FFE66D' }]}>{entry.food_fats}g F</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          </ScrollView>
          
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // HOME SCREEN
  // ==========================================================================
  if (activeTab === 'home' && screen === 'main') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.homeScrollContent}>
            <View style={styles.homeHeader}>
              <Text style={styles.homeTitle}>NutriSnap</Text>
              <Text style={styles.homeSubtitle}>AI-Powered Nutrition Tracking</Text>
            </View>

            {/* Quick Stats */}
            {profile.targetCalories && (
              <View style={styles.quickStats}>
                <Text style={styles.quickStatsTitle}>Today's Progress</Text>
                <View style={styles.quickStatsRow}>
                  <Text style={styles.quickStatsValue}>{Math.round(todayTotals.calories)}</Text>
                  <Text style={styles.quickStatsLabel}>/ {profile.targetCalories} kcal</Text>
                </View>
              </View>
            )}

            {/* Meal Selector */}
            <MealSelector selectedMeal={selectedMeal} onSelect={setSelectedMeal} />

            {/* Mode Buttons */}
            {selectedMeal && (
              <View style={styles.modeButtonsContainer}>
                <Text style={styles.modeButtonsTitle}>
                  Add to {selectedMeal.name} {selectedMeal.icon}
                </Text>
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
                  icon="✏️"
                  title="Enter Manually"
                  subtitle="Type in your food details yourself"
                  onPress={goToManualEntry}
                  color="#9B59B6"
                  delay={200}
                />
              </View>
            )}
          </ScrollView>

          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ==========================================================================
  // MANUAL ENTRY SCREEN
  // ==========================================================================
  if (screen === 'manual') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.screenGradient}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.screenHeader}>
              <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
                <Text style={styles.backButtonText}>← Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.screenTitle}>✏️ Manual Entry</Text>
              <Text style={styles.screenSubtitle}>
                {selectedMeal?.icon} {selectedMeal?.name}
              </Text>
            </View>

            {/* Date & Time Section */}
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

            {/* Food Description Section */}
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

            {/* Nutrition Section */}
            <View style={styles.manualSection}>
              <Text style={styles.sectionTitle}>📊 Nutrition Information</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>🔥 Calories *</Text>
                <TextInput
                  style={styles.input}
                  value={manualEntry.calories}
                  onChangeText={(val) => setManualEntry({ ...manualEntry, calories: val })}
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
                    value={manualEntry.proteins}
                    onChangeText={(val) => setManualEntry({ ...manualEntry, proteins: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>⚡ Carbs (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={manualEntry.carbs}
                    onChangeText={(val) => setManualEntry({ ...manualEntry, carbs: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
                
                <View style={styles.macroInputGroupManual}>
                  <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🥑 Fat (g)</Text>
                  <TextInput
                    style={[styles.input, styles.macroInput]}
                    value={manualEntry.fats}
                    onChangeText={(val) => setManualEntry({ ...manualEntry, fats: val })}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>

            {/* Preview Card */}
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
                  </Text>
                  <View style={styles.previewMacros}>
                    <Text style={styles.previewMacro}>
                      🔥 {manualEntry.calories || '0'} kcal
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#FF6B6B' }]}>
                      💪 {manualEntry.proteins || '0'}g
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#4ECDC4' }]}>
                      ⚡ {manualEntry.carbs || '0'}g
                    </Text>
                    <Text style={[styles.previewMacro, { color: '#FFE66D' }]}>
                      🥑 {manualEntry.fats || '0'}g
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Spacer for bottom button */}
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Save Button */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.bottomButton, styles.bottomButtonSecondary]}
              onPress={resetToHome}
            >
              <Text style={styles.bottomButtonSecondaryText}>Cancel</Text>
            </TouchableOpacity>

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
                  <Text style={[styles.inputLabel, { color: '#4ECDC4' }]}>⚡ Carbs (g)</Text>
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
                  <Text style={[styles.inputLabel, { color: '#FFE66D' }]}>🥑 Fat (g)</Text>
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
            </View>

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
              {analysisResult.mealDescription && (
                <View style={styles.mealDescriptionContainer}>
                  <Text style={styles.mealDescription}>{analysisResult.mealDescription}</Text>
                  {analysisResult.nutriscore && <NutriscoreBadge grade={analysisResult.nutriscore} />}
                </View>
              )}

              <View style={styles.macroSummary}>
                <MacroCard label="Calories" value={analysisResult.totalCalories} unit="kcal" color="#FF6B6B" icon="🔥" delay={0} />
                <MacroCard label="Protein" value={analysisResult.totalProtein} unit="g" color="#4ECDC4" icon="💪" delay={100} />
                <MacroCard label="Carbs" value={analysisResult.totalCarbs} unit="g" color="#FFE66D" icon="⚡" delay={200} />
                <MacroCard label="Fat" value={analysisResult.totalFat} unit="g" color="#A78BFA" icon="🥑" delay={300} />
              </View>

              <View style={styles.foodItemsSection}>
                <Text style={styles.sectionTitle}>
                  {scanMode === 'barcode' ? 'Nutrition Facts' : 'Food Items Detected'}
                </Text>
                {analysisResult.foods?.map((item, index) => (
                  <FoodItemCard key={index} item={item} index={index} />
                ))}
              </View>

              {analysisResult.ingredients && (
                <View style={styles.ingredientsSection}>
                  <Text style={styles.sectionTitle}>Ingredients</Text>
                  <View style={styles.ingredientsCard}>
                    <Text style={styles.ingredientsText}>{analysisResult.ingredients}</Text>
                  </View>
                </View>
              )}
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
                  setScreen('camera');
                } else {
                  setScannedBarcode(null);
                  setAnalysisResult(null);
                  setIsScanning(true);
                  setScreen('barcode');
                }
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

  // Permission Screen
  permissionContainer: { flex: 1 },
  permissionGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  permissionIcon: { fontSize: 80, marginBottom: 30 },
  permissionTitle: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 16, textAlign: 'center' },
  permissionText: { fontSize: 16, color: '#a0a0a0', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  permissionButton: { borderRadius: 30, overflow: 'hidden' },
  permissionButtonGradient: { paddingVertical: 16, paddingHorizontal: 40 },
  permissionButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(26, 26, 46, 0.98)',
    paddingBottom: 25,
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
    paddingTop: 10,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  modeButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modeButtonGradient: {
    padding: 24,
    alignItems: 'center',
  },
  modeButtonIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  modeButtonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  modeButtonSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
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
    marginHorizontal: 16,
    marginBottom: 24,
  },
  macroProgressCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  macroProgressIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  macroProgressLabel: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  macroProgressValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  macroProgressTarget: {
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
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
    fontSize: 11,
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
  backButton: { marginBottom: 10 },
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
});
