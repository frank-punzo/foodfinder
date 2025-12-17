import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// API SERVICES
// ============================================

// Food Analysis Service using Claude API (for photo analysis)
const analyzeFoodImage = async (base64Image) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': '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',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
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
                
Please identify each food item visible on the plate and estimate:
1. The food item name
2. Approximate portion size (in grams or common measurements)
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

If this is not a food image or you cannot identify food items, respond with:
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

// Barcode Lookup Service using Open Food Facts API
const lookupBarcode = async (barcode) => {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const nutriments = product.nutriments || {};
      
      // Extract serving size info
      const servingSize = product.serving_size || product.quantity || '1 serving';
      
      // Get per-serving values if available, otherwise use per-100g
      const calories = Math.round(
        nutriments['energy-kcal_serving'] || 
        nutriments['energy-kcal_100g'] || 
        (nutriments['energy_serving'] ? nutriments['energy_serving'] / 4.184 : 0) ||
        (nutriments['energy_100g'] ? nutriments['energy_100g'] / 4.184 : 0) ||
        0
      );
      
      const protein = Math.round(
        (nutriments.proteins_serving || nutriments.proteins_100g || 0) * 10
      ) / 10;
      
      const carbs = Math.round(
        (nutriments.carbohydrates_serving || nutriments.carbohydrates_100g || 0) * 10
      ) / 10;
      
      const fat = Math.round(
        (nutriments.fat_serving || nutriments.fat_100g || 0) * 10
      ) / 10;

      return {
        found: true,
        productName: product.product_name || 'Unknown Product',
        brand: product.brands || '',
        servingSize: servingSize,
        imageUrl: product.image_url || product.image_front_url || null,
        foods: [
          {
            name: product.product_name || 'Unknown Product',
            portion: servingSize,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
          },
        ],
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
    } else {
      return {
        found: false,
        error: 'Product not found in database',
      };
    }
  } catch (error) {
    console.error('Error looking up barcode:', error);
    throw error;
  }
};

// ============================================
// UI COMPONENTS
// ============================================

// Animated Macro Card Component
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
        {
          transform: [{ scale: scaleValue }],
          opacity: animatedValue,
        },
      ]}
    >
      <LinearGradient
        colors={[color + '20', color + '05']}
        style={styles.macroGradient}
      >
        <Text style={styles.macroIcon}>{icon}</Text>
        <Text style={[styles.macroValue, { color }]}>{value}</Text>
        <Text style={styles.macroUnit}>{unit}</Text>
        <Text style={styles.macroLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
};

// Food Item Card Component
const FoodItemCard = ({ item, index }) => {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.foodItemCard,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.foodItemHeader}>
        <Text style={styles.foodItemName}>{item.name}</Text>
        <Text style={styles.foodItemPortion}>{item.portion}</Text>
      </View>
      <View style={styles.foodItemMacros}>
        <View style={styles.miniMacro}>
          <Text style={styles.miniMacroValue}>{item.calories}</Text>
          <Text style={styles.miniMacroLabel}>kcal</Text>
        </View>
        <View style={styles.miniMacroDivider} />
        <View style={styles.miniMacro}>
          <Text style={[styles.miniMacroValue, { color: '#FF6B6B' }]}>{item.protein}g</Text>
          <Text style={styles.miniMacroLabel}>protein</Text>
        </View>
        <View style={styles.miniMacroDivider} />
        <View style={styles.miniMacro}>
          <Text style={[styles.miniMacroValue, { color: '#4ECDC4' }]}>{item.carbs}g</Text>
          <Text style={styles.miniMacroLabel}>carbs</Text>
        </View>
        <View style={styles.miniMacroDivider} />
        <View style={styles.miniMacro}>
          <Text style={[styles.miniMacroValue, { color: '#FFE66D' }]}>{item.fat}g</Text>
          <Text style={styles.miniMacroLabel}>fat</Text>
        </View>
      </View>
    </Animated.View>
  );
};

// Mode Selection Button Component
const ModeButton = ({ icon, title, subtitle, onPress, color, delay }) => {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      <TouchableOpacity
        style={styles.modeButton}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[color, color + 'CC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modeButtonGradient}
        >
          <Text style={styles.modeButtonIcon}>{icon}</Text>
          <Text style={styles.modeButtonTitle}>{title}</Text>
          <Text style={styles.modeButtonSubtitle}>{subtitle}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Nutri-Score Badge Component
const NutriscoreBadge = ({ grade }) => {
  if (!grade) return null;
  
  const colors = {
    a: '#038141',
    b: '#85BB2F',
    c: '#FECB02',
    d: '#EE8100',
    e: '#E63E11',
  };
  
  return (
    <View style={[styles.nutriscoreBadge, { backgroundColor: colors[grade.toLowerCase()] || '#888' }]}>
      <Text style={styles.nutriscoreText}>Nutri-Score {grade.toUpperCase()}</Text>
    </View>
  );
};

// ============================================
// MAIN APP COMPONENT
// ============================================

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState('home'); // 'home', 'camera', 'barcode', 'results'
  const [capturedImage, setCapturedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState(null); // 'photo' or 'barcode'
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const cameraRef = useRef(null);
  
  // Animation values
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(contentSlide, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Loading state
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  // Permission request screen
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={styles.permissionGradient}
        >
          <Text style={styles.permissionIcon}>📸</Text>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            NutriSnap needs camera access to analyze your food photos and scan barcodes for nutritional information.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <LinearGradient
              colors={['#FF6B6B', '#FF8E53']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.permissionButtonGradient}
            >
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Take photo handler
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });
        
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

  // Analyze food photo
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
      console.error('Analysis error:', err);
      setError('Failed to analyze food. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Barcode scanned handler
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
      console.error('Barcode lookup error:', err);
      setError('Failed to look up product. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset to home
  const resetToHome = () => {
    setScreen('home');
    setCapturedImage(null);
    setAnalysisResult(null);
    setError(null);
    setScanMode(null);
    setScannedBarcode(null);
    setIsScanning(true);
  };

  // Navigate to camera mode
  const goToCamera = () => {
    setScanMode('photo');
    setScreen('camera');
  };

  // Navigate to barcode scanner
  const goToBarcode = () => {
    setScanMode('barcode');
    setIsScanning(true);
    setScreen('barcode');
  };

  // ============================================
  // HOME SCREEN
  // ============================================
  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.homeContainer}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={styles.homeGradient}
        >
          <Animated.View style={[styles.homeHeader, { opacity: headerOpacity }]}>
            <Text style={styles.homeTitle}>NutriSnap</Text>
            <Text style={styles.homeSubtitle}>AI-Powered Nutrition Tracking</Text>
          </Animated.View>

          <View style={styles.homeContent}>
            <Animated.Text 
              style={[
                styles.homePrompt,
                { transform: [{ translateY: contentSlide }], opacity: headerOpacity }
              ]}
            >
              How would you like to track your food?
            </Animated.Text>

            <View style={styles.modeButtonsContainer}>
              <ModeButton
                icon="📸"
                title="Take a Photo"
                subtitle="Snap your plate for instant AI analysis"
                onPress={goToCamera}
                color="#FF6B6B"
                delay={200}
              />
              
              <ModeButton
                icon="📊"
                title="Scan Barcode"
                subtitle="Scan packaged food for nutrition facts"
                onPress={goToBarcode}
                color="#4ECDC4"
                delay={400}
              />
            </View>
          </View>

          <Animated.View style={[styles.homeFooter, { opacity: headerOpacity }]}>
            <Text style={styles.homeFooterText}>
              🥗 Track calories, protein, carbs & fat
            </Text>
          </Animated.View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ============================================
  // CAMERA SCREEN (Photo Mode)
  // ============================================
  if (screen === 'camera') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.backButtonCamera} onPress={resetToHome}>
                <Text style={styles.backButtonCameraText}>← Back</Text>
              </TouchableOpacity>
              <View style={styles.cameraHeaderCenter}>
                <Text style={styles.cameraModeTitle}>Photo Mode</Text>
                <Text style={styles.cameraModeSubtitle}>Capture your meal</Text>
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
              <Text style={styles.instructionText}>
                Position your plate within the frame
              </Text>
              <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                <LinearGradient
                  colors={['#FF6B6B', '#FF8E53']}
                  style={styles.captureButtonInner}
                >
                  <View style={styles.captureButtonCore} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ============================================
  // BARCODE SCANNER SCREEN
  // ============================================
  if (screen === 'barcode') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'itf14',
              'codabar',
              'datamatrix',
              'qr',
            ],
          }}
          onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
        >
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.backButtonCamera} onPress={resetToHome}>
                <Text style={styles.backButtonCameraText}>← Back</Text>
              </TouchableOpacity>
              <View style={styles.cameraHeaderCenter}>
                <Text style={styles.cameraModeTitle}>Barcode Scanner</Text>
                <Text style={styles.cameraModeSubtitle}>Scan product barcode</Text>
              </View>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.barcodeFrameContainer}>
              <View style={styles.barcodeFrame}>
                <View style={[styles.barcodeCorner, styles.barcodeCornerTL]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerTR]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerBL]} />
                <View style={[styles.barcodeCorner, styles.barcodeCornerBR]} />
                
                {/* Scanning line animation */}
                <Animated.View style={styles.scanLine} />
              </View>
            </View>

            <View style={styles.cameraControls}>
              <View style={styles.barcodeInstructions}>
                <Text style={styles.barcodeIcon}>📊</Text>
                <Text style={styles.instructionText}>
                  Align barcode within the frame
                </Text>
                <Text style={styles.instructionSubtext}>
                  Supports UPC, EAN, QR codes & more
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ============================================
  // RESULTS SCREEN
  // ============================================
  return (
    <SafeAreaView style={styles.resultsContainer}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.resultsGradient}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.resultsHeader}>
            <TouchableOpacity style={styles.backButton} onPress={resetToHome}>
              <Text style={styles.backButtonText}>← Home</Text>
            </TouchableOpacity>
            <Text style={styles.resultsTitle}>
              {scanMode === 'barcode' ? 'Product Info' : 'Analysis Results'}
            </Text>
            {scannedBarcode && (
              <Text style={styles.barcodeNumber}>UPC: {scannedBarcode}</Text>
            )}
          </View>

          {/* Image Display */}
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

          {/* Product Image (for barcode scans) */}
          {scanMode === 'barcode' && analysisResult?.imageUrl && (
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: analysisResult.imageUrl }} 
                style={styles.productImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Loading state for barcode */}
          {scanMode === 'barcode' && isAnalyzing && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#4ECDC4" />
              <Text style={styles.loadingText}>Looking up product...</Text>
            </View>
          )}

          {/* Error Display */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={resetToHome}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Analysis Results */}
          {analysisResult && !error && (
            <>
              {/* Meal/Product Description */}
              {analysisResult.mealDescription && (
                <View style={styles.mealDescriptionContainer}>
                  <Text style={styles.mealDescription}>
                    {analysisResult.mealDescription}
                  </Text>
                  {analysisResult.nutriscore && (
                    <NutriscoreBadge grade={analysisResult.nutriscore} />
                  )}
                </View>
              )}

              {/* Macro Summary Cards */}
              <View style={styles.macroSummary}>
                <MacroCard
                  label="Calories"
                  value={analysisResult.totalCalories}
                  unit="kcal"
                  color="#FF6B6B"
                  icon="🔥"
                  delay={0}
                />
                <MacroCard
                  label="Protein"
                  value={analysisResult.totalProtein}
                  unit="g"
                  color="#4ECDC4"
                  icon="💪"
                  delay={100}
                />
                <MacroCard
                  label="Carbs"
                  value={analysisResult.totalCarbs}
                  unit="g"
                  color="#FFE66D"
                  icon="⚡"
                  delay={200}
                />
                <MacroCard
                  label="Fat"
                  value={analysisResult.totalFat}
                  unit="g"
                  color="#A78BFA"
                  icon="🥑"
                  delay={300}
                />
              </View>

              {/* Food Items List */}
              <View style={styles.foodItemsSection}>
                <Text style={styles.sectionTitle}>
                  {scanMode === 'barcode' ? 'Nutrition Facts' : 'Food Items Detected'}
                </Text>
                {analysisResult.foods && analysisResult.foods.map((item, index) => (
                  <FoodItemCard key={index} item={item} index={index} />
                ))}
              </View>

              {/* Ingredients (for barcode scans) */}
              {analysisResult.ingredients && (
                <View style={styles.ingredientsSection}>
                  <Text style={styles.sectionTitle}>Ingredients</Text>
                  <View style={styles.ingredientsCard}>
                    <Text style={styles.ingredientsText}>
                      {analysisResult.ingredients}
                    </Text>
                  </View>
                </View>
              )}

              {/* Disclaimer */}
              <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                  {scanMode === 'barcode' 
                    ? 'ℹ️ Nutritional data from Open Food Facts database. Values may vary by region and product version.'
                    : 'ℹ️ Nutritional values are estimates based on visual analysis. Actual values may vary based on preparation methods and exact portions.'}
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom Actions */}
        {(analysisResult || error) && !isAnalyzing && (
          <View style={styles.bottomActions}>
            <TouchableOpacity 
              style={[styles.bottomButton, styles.bottomButtonSecondary]} 
              onPress={() => {
                if (scanMode === 'photo') {
                  setCapturedImage(null);
                  setAnalysisResult(null);
                  setError(null);
                  setScreen('camera');
                } else {
                  setScannedBarcode(null);
                  setAnalysisResult(null);
                  setError(null);
                  setIsScanning(true);
                  setScreen('barcode');
                }
              }}
            >
              <Text style={styles.bottomButtonSecondaryText}>
                {scanMode === 'photo' ? '📸 New Photo' : '📊 Scan Again'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.bottomButton} onPress={resetToHome}>
              <LinearGradient
                colors={['#FF6B6B', '#FF8E53']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bottomButtonGradient}
              >
                <Text style={styles.bottomButtonText}>🏠 Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  
  // Permission Screen
  permissionContainer: {
    flex: 1,
  },
  permissionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionIcon: {
    fontSize: 80,
    marginBottom: 30,
  },
  permissionTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  permissionButton: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  permissionButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Home Screen
  homeContainer: {
    flex: 1,
  },
  homeGradient: {
    flex: 1,
    paddingHorizontal: 24,
  },
  homeHeader: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  homeTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  homeSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
  },
  homeContent: {
    flex: 1,
    justifyContent: 'center',
  },
  homePrompt: {
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '600',
  },
  modeButtonsContainer: {
    gap: 20,
  },
  modeButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modeButtonGradient: {
    padding: 28,
    alignItems: 'center',
  },
  modeButtonIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  modeButtonTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  modeButtonSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  homeFooter: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  homeFooterText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Camera Screen
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButtonCamera: {
    padding: 8,
  },
  backButtonCameraText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cameraHeaderCenter: {
    alignItems: 'center',
  },
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
  frameGuide: {
    flex: 1,
    margin: 40,
    position: 'relative',
  },
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
  frameCornerTR: {
    borderLeftWidth: 0,
    borderRightWidth: 3,
    left: undefined,
    right: 0,
  },
  frameCornerBL: {
    borderTopWidth: 0,
    borderBottomWidth: 3,
    top: undefined,
    bottom: 0,
  },
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
  cameraControls: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
  instructionSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    flex: 1,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },

  // Barcode Scanner Specific
  barcodeFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barcodeFrame: {
    width: 280,
    height: 160,
    position: 'relative',
  },
  barcodeCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#4ECDC4',
  },
  barcodeCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  barcodeCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  barcodeCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  barcodeCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: '50%',
    height: 2,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  barcodeInstructions: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  barcodeIcon: {
    fontSize: 32,
    marginBottom: 12,
  },

  // Results Screen
  resultsContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  resultsGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  resultsHeader: {
    padding: 20,
    paddingTop: 10,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  barcodeNumber: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  imageContainer: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  capturedImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  productImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#fff',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingCard: {
    margin: 20,
    padding: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },

  // Error Display
  errorContainer: {
    margin: 20,
    padding: 24,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 16,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#FF6B6B',
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Meal Description
  mealDescriptionContainer: {
    margin: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  mealDescription: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  
  // Nutriscore Badge
  nutriscoreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
  },
  nutriscoreText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Macro Summary
  macroSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  macroCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  macroGradient: {
    padding: 16,
    alignItems: 'center',
  },
  macroIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  macroValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  macroUnit: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 2,
  },
  macroLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },

  // Food Items Section
  foodItemsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  foodItemCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  foodItemHeader: {
    marginBottom: 12,
  },
  foodItemName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  foodItemPortion: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  foodItemMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniMacro: {
    alignItems: 'center',
    flex: 1,
  },
  miniMacroValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  miniMacroLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    marginTop: 2,
  },
  miniMacroDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Ingredients Section
  ingredientsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  ingredientsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  ingredientsText: {
    color: '#a0a0a0',
    fontSize: 14,
    lineHeight: 22,
  },

  // Disclaimer
  disclaimer: {
    margin: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  disclaimerText: {
    color: '#a0a0a0',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Bottom Actions
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
  bottomButton: {
    flex: 1,
    borderRadius: 25,
    overflow: 'hidden',
  },
  bottomButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  bottomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomButtonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomButtonSecondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 16,
  },
});
