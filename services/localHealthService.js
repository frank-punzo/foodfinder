// =============================================================================
// LOCAL HEALTH SERVICE FOR SNAPPLATE
// =============================================================================
// Handles Health Connect (Android) and HealthKit (iOS) integrations
// These are local device APIs that require native modules
// =============================================================================

import { Platform } from 'react-native';
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
 * Request Health Connect permissions
 * @returns {Promise<{success: boolean, permissions?: object, error?: string}>}
 */
export const requestHealthConnectPermissions = async () => {
  if (!isHealthConnectAvailable()) {
    return { success: false, error: 'Health Connect not available' };
  }

  try {
    // Check if Health Connect SDK is available
    const isAvailable = await HealthConnect.getSdkStatus();
    if (isAvailable !== HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE) {
      return {
        success: false,
        error: 'Health Connect is not installed or not available on this device',
      };
    }

    // Request permissions for calorie data
    const result = await HealthConnect.requestPermission([
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);

    return {
      success: result.length > 0,
      permissions: result,
    };
  } catch (error) {
    console.error('Health Connect permission error:', error);
    return { success: false, error: error.message };
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

export default {
  isHealthConnectAvailable,
  isHealthKitAvailable,
  isLocalHealthAvailable,
  requestHealthConnectPermissions,
  getHealthConnectCaloriesBurned,
  requestHealthKitPermissions,
  getHealthKitCaloriesBurned,
  requestLocalHealthPermissions,
  getLocalCaloriesBurned,
  syncLocalHealthToBackend,
};
