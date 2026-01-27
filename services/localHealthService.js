// =============================================================================
// LOCAL HEALTH SERVICE FOR SNAPPLATE
// =============================================================================
// Handles Health Connect (Android) and HealthKit (iOS) integrations
// These are local device APIs that require native modules
// =============================================================================

import { Platform, Linking } from 'react-native';
import { syncLocalHealthData } from './healthService';

// =============================================================================
// NATIVE MODULE IMPORTS (Conditional)
// =============================================================================
// These modules may not be available depending on the build configuration
// We use try/catch to gracefully handle missing modules

let HealthConnect = null;
let AppleHealthKit = null;

// Try to import Health Connect for Android
if (Platform.OS === 'android') {
  try {
    // Note: You'll need to install a Health Connect package like:
    // npx expo install react-native-health-connect
    // or build a custom native module
    HealthConnect = require('react-native-health-connect');
  } catch (e) {
    console.log('Health Connect module not available');
  }
}

/**
 * Open Health Connect settings app (Android)
 * Useful when user needs to grant permissions manually
 */
export const openHealthConnectSettings = () => {
  if (HealthConnect && HealthConnect.openHealthConnectSettings) {
    HealthConnect.openHealthConnectSettings();
  }
};

/**
 * Open Health app settings (iOS)
 * Opens the iOS Settings app to the Health section
 */
export const openHealthKitSettings = () => {
  if (Platform.OS === 'ios') {
    // Open iOS Health app settings
    Linking.openURL('x-apple-health://');
  }
};

/**
 * Open the appropriate health settings for the current platform
 * @param {string} providerId - Optional provider ID to open specific settings
 */
export const openHealthSettings = (providerId = null) => {
  if (providerId === 'health_connect' || (providerId === null && Platform.OS === 'android')) {
    openHealthConnectSettings();
  } else if (providerId === 'healthkit' || (providerId === null && Platform.OS === 'ios')) {
    openHealthKitSettings();
  }
};

// Try to import HealthKit for iOS
if (Platform.OS === 'ios') {
  try {
    // Note: You'll need to install a HealthKit package like:
    // npx expo install react-native-health
    // or use expo-apple-health-kit
    AppleHealthKit = require('react-native-health').default;
  } catch (e) {
    console.log('HealthKit module not available');
  }
}

// =============================================================================
// AVAILABILITY CHECKS
// =============================================================================

/**
 * Check if Health Connect is available on this device
 */
export const isHealthConnectAvailable = () => {
  return Platform.OS === 'android' && HealthConnect !== null;
};

/**
 * Check if HealthKit is available on this device
 */
export const isHealthKitAvailable = () => {
  return Platform.OS === 'ios' && AppleHealthKit !== null;
};

/**
 * Check if any local health API is available
 * @param {string} providerId - Optional provider ID to check specific provider
 */
export const isLocalHealthAvailable = async (providerId = null) => {
  if (providerId === 'health_connect' || (providerId === null && Platform.OS === 'android')) {
    if (!isHealthConnectAvailable()) {
      return false;
    }
    // Also check if Health Connect SDK is actually available on the device
    try {
      const status = await HealthConnect.getSdkStatus();
      return status === HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch (e) {
      console.log('Health Connect SDK check failed:', e);
      return false;
    }
  }

  if (providerId === 'healthkit' || (providerId === null && Platform.OS === 'ios')) {
    return isHealthKitAvailable();
  }

  return false;
};

// =============================================================================
// HEALTH CONNECT (Android)
// =============================================================================

/**
 * Initialize Health Connect client
 * Must be called before requesting permissions or reading data
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export const initializeHealthConnect = async () => {
  if (!isHealthConnectAvailable()) {
    return false;
  }

  try {
    // Initialize the Health Connect client
    const isInitialized = await HealthConnect.initialize();
    console.log('Health Connect initialized:', isInitialized);
    return isInitialized;
  } catch (error) {
    console.error('Health Connect initialization error:', error);
    return false;
  }
};

/**
 * Request Health Connect permissions
 * @returns {Promise<{success: boolean, permissions?: object, error?: string}>}
 */
export const requestHealthConnectPermissions = async () => {
  if (!isHealthConnectAvailable()) {
    return { success: false, error: 'Health Connect not available' };
  }

  try {
    // Check if Health Connect SDK is available
    const sdkStatus = await HealthConnect.getSdkStatus();
    if (sdkStatus !== HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) {
      return {
        success: false,
        error: 'Health Connect is not installed or not available on this device',
      };
    }

    // Initialize the client first (required before requesting permissions)
    const initialized = await initializeHealthConnect();
    if (!initialized) {
      return {
        success: false,
        error: 'Failed to initialize Health Connect client',
      };
    }

    // Request permissions for calorie and weight data
    console.log('Requesting Health Connect permissions...');
    const result = await HealthConnect.requestPermission([
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Weight' },
    ]);

    console.log('Health Connect permission result:', JSON.stringify(result));

    // Check if permissions were granted
    if (!result || result.length === 0) {
      return {
        success: false,
        error: 'No permissions were granted. Please allow access in the Health Connect permission dialog.',
      };
    }

    return {
      success: true,
      permissions: result,
    };
  } catch (error) {
    console.error('Health Connect permission error:', error);
    return { success: false, error: `Permission request failed: ${error.message}` };
  }
};

/**
 * Get calories burned from Health Connect for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Object with date keys and calorie data
 */
export const getHealthConnectCaloriesBurned = async (startDate, endDate) => {
  if (!isHealthConnectAvailable()) {
    return null;
  }

  try {
    // Ensure client is initialized before reading
    const initialized = await initializeHealthConnect();
    if (!initialized) {
      console.error('Health Connect not initialized');
      return null;
    }

    const startTime = new Date(startDate);
    startTime.setHours(0, 0, 0, 0);

    const endTime = new Date(endDate);
    endTime.setHours(23, 59, 59, 999);

    // Read total calories burned
    const totalCaloriesResult = await HealthConnect.readRecords('TotalCaloriesBurned', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    // Read active calories burned
    const activeCaloriesResult = await HealthConnect.readRecords('ActiveCaloriesBurned', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    // Aggregate by day
    return aggregateCaloriesByDay(
      totalCaloriesResult.records || [],
      activeCaloriesResult.records || [],
      startDate,
      endDate
    );
  } catch (error) {
    console.error('Health Connect read error:', error);
    return null;
  }
};

// =============================================================================
// APPLE HEALTHKIT (iOS)
// =============================================================================

/**
 * Request HealthKit permissions
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const requestHealthKitPermissions = async () => {
  if (!isHealthKitAvailable()) {
    return { success: false, error: 'HealthKit not available' };
  }

  return new Promise((resolve) => {
    const options = {
      permissions: {
        read: [
          AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
          AppleHealthKit.Constants.Permissions.BasalEnergyBurned,
        ],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(options, (error) => {
      if (error) {
        console.error('HealthKit init error:', error);
        resolve({ success: false, error: error.message || 'HealthKit authorization failed' });
      } else {
        resolve({ success: true });
      }
    });
  });
};

/**
 * Get calories burned from HealthKit for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Object with date keys and calorie data
 */
export const getHealthKitCaloriesBurned = async (startDate, endDate) => {
  if (!isHealthKitAvailable()) {
    return null;
  }

  try {
    const options = {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate + 'T23:59:59').toISOString(),
      ascending: true,
      period: 1440, // Minutes in a day - aggregate by day
    };

    // Get active energy (exercise calories)
    const activeEnergy = await new Promise((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(options, (error, results) => {
        if (error) {
          console.error('HealthKit active energy error:', error);
          resolve([]);
        } else {
          resolve(results || []);
        }
      });
    });

    // Get basal energy (resting calories)
    const basalEnergy = await new Promise((resolve) => {
      AppleHealthKit.getBasalEnergyBurned(options, (error, results) => {
        if (error) {
          console.error('HealthKit basal energy error:', error);
          resolve([]);
        } else {
          resolve(results || []);
        }
      });
    });

    // Aggregate by day
    return aggregateHealthKitByDay(activeEnergy, basalEnergy, startDate, endDate);
  } catch (error) {
    console.error('HealthKit read error:', error);
    return null;
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Aggregate Health Connect calorie records by day
 */
const aggregateCaloriesByDay = (totalRecords, activeRecords, startDate, endDate) => {
  const result = {};

  // Initialize all dates with zeros
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    result[dateStr] = {
      total_calories: 0,
      active_calories: 0,
      steps: 0,
      active_minutes: 0,
    };
    current.setDate(current.getDate() + 1);
  }

  // Aggregate total calories
  totalRecords.forEach((record) => {
    const dateStr = new Date(record.startTime).toISOString().split('T')[0];
    if (result[dateStr]) {
      result[dateStr].total_calories += Math.round(record.energy?.inKilocalories || 0);
    }
  });

  // Aggregate active calories
  activeRecords.forEach((record) => {
    const dateStr = new Date(record.startTime).toISOString().split('T')[0];
    if (result[dateStr]) {
      result[dateStr].active_calories += Math.round(record.energy?.inKilocalories || 0);
    }
  });

  return result;
};

/**
 * Aggregate HealthKit calorie data by day
 */
const aggregateHealthKitByDay = (activeEnergy, basalEnergy, startDate, endDate) => {
  const result = {};

  // Initialize all dates with zeros
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    result[dateStr] = {
      total_calories: 0,
      active_calories: 0,
      steps: 0,
      active_minutes: 0,
    };
    current.setDate(current.getDate() + 1);
  }

  // Process active energy
  activeEnergy.forEach((record) => {
    const dateStr = new Date(record.startDate).toISOString().split('T')[0];
    if (result[dateStr]) {
      result[dateStr].active_calories += Math.round(record.value || 0);
    }
  });

  // Process basal energy and calculate total
  basalEnergy.forEach((record) => {
    const dateStr = new Date(record.startDate).toISOString().split('T')[0];
    if (result[dateStr]) {
      const basal = Math.round(record.value || 0);
      result[dateStr].total_calories = result[dateStr].active_calories + basal;
    }
  });

  // If no basal data, total = active
  Object.keys(result).forEach((dateStr) => {
    if (result[dateStr].total_calories === 0 && result[dateStr].active_calories > 0) {
      result[dateStr].total_calories = result[dateStr].active_calories;
    }
  });

  return result;
};

// =============================================================================
// UNIFIED INTERFACE
// =============================================================================

/**
 * Request permissions for the appropriate local health API
 * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
 */
export const requestLocalHealthPermissions = async () => {
  if (Platform.OS === 'android' && isHealthConnectAvailable()) {
    const result = await requestHealthConnectPermissions();
    return { ...result, provider: 'health_connect' };
  } else if (Platform.OS === 'ios' && isHealthKitAvailable()) {
    const result = await requestHealthKitPermissions();
    return { ...result, provider: 'healthkit' };
  }

  return {
    success: false,
    error: 'No local health API available on this device',
  };
};

/**
 * Get calories burned from the local health API
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<{data: Object|null, provider: string|null}>}
 */
export const getLocalCaloriesBurned = async (startDate, endDate) => {
  if (Platform.OS === 'android' && isHealthConnectAvailable()) {
    const data = await getHealthConnectCaloriesBurned(startDate, endDate);
    return { data, provider: 'health_connect' };
  } else if (Platform.OS === 'ios' && isHealthKitAvailable()) {
    const data = await getHealthKitCaloriesBurned(startDate, endDate);
    return { data, provider: 'healthkit' };
  }

  return { data: null, provider: null };
};

/**
 * Sync local health data to the backend
 * Fetches data from local API and uploads to server
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<{success: boolean, provider?: string, daysSynced?: number, error?: string}>}
 */
export const syncLocalHealthToBackend = async (startDate, endDate) => {
  const { data, provider } = await getLocalCaloriesBurned(startDate, endDate);

  if (!data || !provider) {
    return {
      success: false,
      error: 'Could not read local health data',
    };
  }

  const success = await syncLocalHealthData(provider, data);

  if (success) {
    return {
      success: true,
      provider,
      daysSynced: Object.keys(data).length,
    };
  } else {
    return {
      success: false,
      error: 'Failed to sync data to server',
    };
  }
};

// =============================================================================
// WEIGHT DATA READING
// =============================================================================

/**
 * Get today's weight from Health Connect (Android)
 * @returns {Promise<{weight: number|null, unit: string, error?: string}>}
 */
export const getHealthConnectWeight = async () => {
  if (!isHealthConnectAvailable()) {
    console.log('Health Connect not available for weight');
    return { weight: null, unit: 'kg', error: 'Health Connect not available' };
  }

  try {
    // Ensure client is initialized before reading
    const initialized = await initializeHealthConnect();
    if (!initialized) {
      console.log('Health Connect not initialized for weight');
      return { weight: null, unit: 'kg', error: 'Health Connect not initialized' };
    }

    // Get today's date range
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(today);
    endTime.setHours(23, 59, 59, 999);

    console.log('Reading Health Connect weight from', startTime.toISOString(), 'to', endTime.toISOString());

    // Try to read weight records from today
    const weightResult = await HealthConnect.readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    console.log('Health Connect weight result:', JSON.stringify(weightResult));

    const records = weightResult.records || weightResult || [];
    console.log('Weight records found:', records.length);

    if (records.length === 0) {
      // No weight recorded today, try to get most recent weight from last 30 days
      console.log('No weight today, checking last 30 days...');
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      monthAgo.setHours(0, 0, 0, 0);

      const recentWeightResult = await HealthConnect.readRecords('Weight', {
        timeRangeFilter: {
          operator: 'between',
          startTime: monthAgo.toISOString(),
          endTime: endTime.toISOString(),
        },
      });

      console.log('Health Connect recent weight result:', JSON.stringify(recentWeightResult));

      const recentRecords = recentWeightResult.records || recentWeightResult || [];
      console.log('Recent weight records found:', recentRecords.length);

      if (recentRecords.length === 0) {
        return { weight: null, unit: 'kg' };
      }

      // Get the most recent weight entry
      const sortedRecords = recentRecords.sort((a, b) =>
        new Date(b.time || b.startTime) - new Date(a.time || a.startTime)
      );
      const latestRecord = sortedRecords[0];
      console.log('Latest weight record:', JSON.stringify(latestRecord));

      // Health Connect stores weight - check various possible formats
      const weightInKg = latestRecord.weight?.inKilograms
        || latestRecord.mass?.inKilograms
        || latestRecord.value
        || 0;
      console.log('Extracted weight (kg):', weightInKg);
      return { weight: weightInKg > 0 ? weightInKg : null, unit: 'kg' };
    }

    // Get the most recent weight entry from today
    const sortedRecords = records.sort((a, b) =>
      new Date(b.time || b.startTime) - new Date(a.time || a.startTime)
    );
    const latestRecord = sortedRecords[0];
    console.log('Latest weight record from today:', JSON.stringify(latestRecord));

    // Health Connect stores weight - check various possible formats
    const weightInKg = latestRecord.weight?.inKilograms
      || latestRecord.mass?.inKilograms
      || latestRecord.value
      || 0;
    console.log('Extracted weight (kg):', weightInKg);
    return { weight: weightInKg > 0 ? weightInKg : null, unit: 'kg' };
  } catch (error) {
    console.error('Health Connect weight read error:', error);
    return { weight: null, unit: 'kg', error: error.message };
  }
};

/**
 * Get today's weight from HealthKit (iOS)
 * @returns {Promise<{weight: number|null, unit: string, error?: string}>}
 */
export const getHealthKitWeight = async () => {
  if (!isHealthKitAvailable()) {
    return { weight: null, unit: 'kg', error: 'HealthKit not available' };
  }

  return new Promise((resolve) => {
    // First, make sure we have permission to read weight
    const options = {
      permissions: {
        read: [
          AppleHealthKit.Constants.Permissions.Weight,
          AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
          AppleHealthKit.Constants.Permissions.BasalEnergyBurned,
        ],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(options, (initError) => {
      if (initError) {
        console.error('HealthKit init for weight error:', initError);
        resolve({ weight: null, unit: 'kg', error: initError.message });
        return;
      }

      // Get the most recent weight sample
      const weightOptions = {
        unit: 'kg',
      };

      AppleHealthKit.getLatestWeight(weightOptions, (error, results) => {
        if (error) {
          console.error('HealthKit weight read error:', error);
          resolve({ weight: null, unit: 'kg', error: error.message });
          return;
        }

        if (results && results.value && results.value > 0) {
          resolve({ weight: results.value, unit: 'kg' });
        } else {
          resolve({ weight: null, unit: 'kg' });
        }
      });
    });
  });
};

/**
 * Get today's weight from the local health API (platform-agnostic)
 * Returns weight in kg
 * @returns {Promise<{weight: number|null, unit: string, provider: string|null, error?: string}>}
 */
export const getLocalWeight = async () => {
  if (Platform.OS === 'android' && isHealthConnectAvailable()) {
    const result = await getHealthConnectWeight();
    return { ...result, provider: 'health_connect' };
  } else if (Platform.OS === 'ios' && isHealthKitAvailable()) {
    const result = await getHealthKitWeight();
    return { ...result, provider: 'healthkit' };
  }

  return { weight: null, unit: 'kg', provider: null };
};

/**
 * Get weight from Health Connect for a specific date (Android)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{weight: number|null, unit: string, error?: string}>}
 */
export const getHealthConnectWeightByDate = async (dateStr) => {
  if (!isHealthConnectAvailable()) {
    return { weight: null, unit: 'kg', error: 'Health Connect not available' };
  }

  try {
    const initialized = await initializeHealthConnect();
    if (!initialized) {
      return { weight: null, unit: 'kg', error: 'Health Connect not initialized' };
    }

    // Parse the date string and create date range for that day
    const targetDate = new Date(dateStr + 'T00:00:00');
    const startTime = new Date(targetDate);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(targetDate);
    endTime.setHours(23, 59, 59, 999);

    const weightResult = await HealthConnect.readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    const records = weightResult.records || weightResult || [];

    if (records.length === 0) {
      return { weight: null, unit: 'kg' };
    }

    // Get the most recent weight entry from that day
    const sortedRecords = records.sort((a, b) =>
      new Date(b.time || b.startTime) - new Date(a.time || a.startTime)
    );
    const latestRecord = sortedRecords[0];

    const weightInKg = latestRecord.weight?.inKilograms
      || latestRecord.mass?.inKilograms
      || latestRecord.value
      || 0;

    return { weight: weightInKg > 0 ? weightInKg : null, unit: 'kg' };
  } catch (error) {
    console.error('Health Connect weight by date read error:', error);
    return { weight: null, unit: 'kg', error: error.message };
  }
};

/**
 * Get weight from HealthKit for a specific date (iOS)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{weight: number|null, unit: string, error?: string}>}
 */
export const getHealthKitWeightByDate = async (dateStr) => {
  if (!isHealthKitAvailable()) {
    return { weight: null, unit: 'kg', error: 'HealthKit not available' };
  }

  return new Promise((resolve) => {
    const options = {
      permissions: {
        read: [AppleHealthKit.Constants.Permissions.Weight],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(options, (initError) => {
      if (initError) {
        resolve({ weight: null, unit: 'kg', error: initError.message });
        return;
      }

      // Create date range for the target date
      const targetDate = new Date(dateStr + 'T00:00:00');
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const weightOptions = {
        unit: 'kg',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };

      AppleHealthKit.getWeightSamples(weightOptions, (error, results) => {
        if (error) {
          resolve({ weight: null, unit: 'kg', error: error.message });
          return;
        }

        if (results && results.length > 0) {
          // Get the most recent sample from that day
          const sortedResults = results.sort((a, b) =>
            new Date(b.startDate) - new Date(a.startDate)
          );
          const latestWeight = sortedResults[0].value;
          resolve({ weight: latestWeight > 0 ? latestWeight : null, unit: 'kg' });
        } else {
          resolve({ weight: null, unit: 'kg' });
        }
      });
    });
  });
};

/**
 * Get weight from the local health API for a specific date (platform-agnostic)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{weight: number|null, unit: string, provider: string|null, error?: string}>}
 */
export const getLocalWeightByDate = async (dateStr) => {
  if (Platform.OS === 'android' && isHealthConnectAvailable()) {
    const result = await getHealthConnectWeightByDate(dateStr);
    return { ...result, provider: 'health_connect' };
  } else if (Platform.OS === 'ios' && isHealthKitAvailable()) {
    const result = await getHealthKitWeightByDate(dateStr);
    return { ...result, provider: 'healthkit' };
  }

  return { weight: null, unit: 'kg', provider: null };
};

export default {
  isHealthConnectAvailable,
  isHealthKitAvailable,
  isLocalHealthAvailable,
  initializeHealthConnect,
  openHealthConnectSettings,
  openHealthKitSettings,
  openHealthSettings,
  requestHealthConnectPermissions,
  getHealthConnectCaloriesBurned,
  requestHealthKitPermissions,
  getHealthKitCaloriesBurned,
  requestLocalHealthPermissions,
  getLocalCaloriesBurned,
  syncLocalHealthToBackend,
  getHealthConnectWeight,
  getHealthKitWeight,
  getLocalWeight,
  getHealthConnectWeightByDate,
  getHealthKitWeightByDate,
  getLocalWeightByDate,
};
