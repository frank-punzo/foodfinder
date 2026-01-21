// =============================================================================
// HEALTH SERVICE FOR SNAPPLATE
// =============================================================================
// Manages health provider connections (Polar, Oura, Health Connect, HealthKit)
// Handles OAuth flows for cloud providers and data syncing
// =============================================================================

import { Linking, Platform } from 'react-native';
import { getAccessToken } from './authService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_URL = 'https://eljniup0wk.execute-api.us-east-1.amazonaws.com/prod';

// Provider display information and metadata
export const HEALTH_PROVIDERS = {
  health_connect: {
    id: 'health_connect',
    name: 'Google Health Connect',
    icon: '🤖',
    platform: 'android',
    type: 'local',
    description: 'Sync calories burned from Health Connect',
    color: '#4285F4',
  },
  healthkit: {
    id: 'healthkit',
    name: 'Apple Health',
    icon: '🍎',
    platform: 'ios',
    type: 'local',
    description: 'Sync calories burned from Apple Health',
    color: '#FF2D55',
  },
  polar: {
    id: 'polar',
    name: 'Polar Flow',
    icon: '❄️',
    platform: 'all',
    type: 'cloud',
    description: 'Connect your Polar account',
    color: '#D32F2F',
  },
  oura: {
    id: 'oura',
    name: 'Oura Ring',
    icon: '💍',
    platform: 'all',
    type: 'cloud',
    description: 'Connect your Oura account',
    color: '#1E3A5F',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get available providers for the current platform
 * Filters providers based on whether they support the current OS
 */
export const getAvailableProviders = () => {
  const platform = Platform.OS;
  return Object.values(HEALTH_PROVIDERS).filter(
    (provider) => provider.platform === 'all' || provider.platform === platform
  );
};

/**
 * Get provider info by ID
 */
export const getProviderInfo = (providerId) => {
  return HEALTH_PROVIDERS[providerId] || null;
};

// =============================================================================
// CLOUD PROVIDER OAUTH (Polar, Oura)
// =============================================================================

/**
 * Initiate OAuth flow for a cloud provider (Polar or Oura)
 * Opens the provider's authorization page in the browser
 * @param {string} provider - Provider ID ('polar' or 'oura')
 * @returns {Promise<{success: boolean, state?: string, error?: string}>}
 */
export const initiateOAuth = async (provider) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(
      `${API_URL}/health/oauth/initiate?provider=${provider}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to initiate OAuth' };
    }

    // Open OAuth URL in browser
    const supported = await Linking.canOpenURL(data.auth_url);
    if (supported) {
      await Linking.openURL(data.auth_url);
      return { success: true, state: data.state };
    } else {
      return { success: false, error: 'Cannot open authorization URL' };
    }
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return { success: false, error: 'Failed to start connection' };
  }
};

/**
 * Handle OAuth callback deep link
 * Called when the app receives a deep link from OAuth redirect
 * @param {string} url - The deep link URL (e.g., snapplate://oauth/callback?code=X&state=Y)
 * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
 */
export const handleOAuthCallback = async (url) => {
  try {
    // Parse the URL to extract query parameters
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const error = urlObj.searchParams.get('error');
    const errorDescription = urlObj.searchParams.get('error_description');

    if (error) {
      return {
        success: false,
        error: errorDescription || error,
      };
    }

    if (!code || !state) {
      return { success: false, error: 'Missing authorization code or state' };
    }

    // Exchange code for tokens via backend
    const response = await fetch(
      `${API_URL}/health/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to complete connection',
      };
    }

    return {
      success: true,
      provider: data.provider,
      message: data.message,
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return { success: false, error: 'Failed to complete connection' };
  }
};

// =============================================================================
// PROVIDER MANAGEMENT
// =============================================================================

/**
 * Get list of connected health providers for the current user
 * @returns {Promise<Array>} Array of connected provider objects
 */
export const getConnectedProviders = async () => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return [];
    }

    const response = await fetch(`${API_URL}/health/providers`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.providers) {
      return data.providers;
    }
    return [];
  } catch (error) {
    console.error('Error fetching providers:', error);
    return [];
  }
};

/**
 * Disconnect a health provider
 * @param {string} provider - Provider ID to disconnect
 * @returns {Promise<boolean>} Success status
 */
export const disconnectProvider = async (provider) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return false;
    }

    const response = await fetch(`${API_URL}/health/providers/${provider}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error disconnecting provider:', error);
    return false;
  }
};

// =============================================================================
// CALORIES BURNED DATA
// =============================================================================

/**
 * Get calories burned data for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {boolean} refresh - Force refresh from provider API
 * @returns {Promise<Object|null>} Calories burned data or null on error
 */
export const getCaloriesBurned = async (startDate, endDate, refresh = false) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null;
    }

    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (refresh) {
      params.append('refresh', 'true');
    }

    const response = await fetch(
      `${API_URL}/health/calories-burned?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching calories burned:', error);
    return null;
  }
};

/**
 * Sync local health data to backend (Health Connect / HealthKit)
 * @param {string} provider - Provider ID ('health_connect' or 'healthkit')
 * @param {Object} data - Object with date keys and calorie values
 * @returns {Promise<boolean>} Success status
 */
export const syncLocalHealthData = async (provider, data) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return false;
    }

    const response = await fetch(`${API_URL}/health/sync-local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        provider,
        data,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Sync error:', error);
    return false;
  }
};

// =============================================================================
// CONSUMPTION VS BURNED REPORT
// =============================================================================

/**
 * Get consumption vs burned report data
 * @param {number} days - Number of days to include (default 30)
 * @returns {Promise<Object|null>} Report data or null on error
 */
export const getConsumptionVsBurnedReport = async (days = 30) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null;
    }

    const response = await fetch(
      `${API_URL}/my/reports/consumption-vs-burned?days=${days}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching consumption vs burned report:', error);
    return null;
  }
};

// =============================================================================
// DEEP LINK UTILITIES
// =============================================================================

/**
 * Check if a URL is an OAuth callback deep link
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export const isOAuthCallback = (url) => {
  return url && url.startsWith('snapplate://oauth/callback');
};

/**
 * Set up deep link listener for OAuth callbacks
 * @param {Function} onCallback - Callback function when OAuth completes
 * @returns {Function} Cleanup function to remove listener
 */
export const setupOAuthDeepLinkListener = (onCallback) => {
  const handleDeepLink = async (event) => {
    const url = event.url;
    if (isOAuthCallback(url)) {
      const result = await handleOAuthCallback(url);
      onCallback(result);
    }
  };

  // Add listener
  const subscription = Linking.addEventListener('url', handleDeepLink);

  // Check if app was opened via deep link
  Linking.getInitialURL().then((url) => {
    if (url && isOAuthCallback(url)) {
      handleOAuthCallback(url).then(onCallback);
    }
  });

  // Return cleanup function
  return () => {
    subscription.remove();
  };
};

export default {
  HEALTH_PROVIDERS,
  getAvailableProviders,
  getProviderInfo,
  initiateOAuth,
  handleOAuthCallback,
  getConnectedProviders,
  disconnectProvider,
  getCaloriesBurned,
  syncLocalHealthData,
  getConsumptionVsBurnedReport,
  isOAuthCallback,
  setupOAuthDeepLinkListener,
};
