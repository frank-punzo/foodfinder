// =============================================================================
// AUTHENTICATION SERVICE FOR NUTRISNAP
// =============================================================================
// This file provides authentication functions for the React Native app
// using the Food Finder API's Cognito integration
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Auth configuration - Update these values after deploying Terraform
export const AUTH_CONFIG = {
  // API URL for authentication endpoints
  API_URL: 'https://102rxnded9.execute-api.us-east-1.amazonaws.com/dev',
  
  // Storage keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: '@auth_access_token',
    ID_TOKEN: '@auth_id_token',
    REFRESH_TOKEN: '@auth_refresh_token',
    USER_DATA: '@auth_user_data',
    CUSTOMER_ID: '@auth_customer_id',
  },
};

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Store authentication tokens securely
 */
export const storeTokens = async (tokens) => {
  try {
    const { access_token, id_token, refresh_token } = tokens;
    
    await AsyncStorage.multiSet([
      [AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN, access_token || ''],
      [AUTH_CONFIG.STORAGE_KEYS.ID_TOKEN, id_token || ''],
      [AUTH_CONFIG.STORAGE_KEYS.REFRESH_TOKEN, refresh_token || ''],
    ]);
    
    return true;
  } catch (error) {
    console.error('Error storing tokens:', error);
    return false;
  }
};

/**
 * Retrieve stored tokens
 */
export const getTokens = async () => {
  try {
    const values = await AsyncStorage.multiGet([
      AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN,
      AUTH_CONFIG.STORAGE_KEYS.ID_TOKEN,
      AUTH_CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
    ]);
    
    return {
      accessToken: values[0][1],
      idToken: values[1][1],
      refreshToken: values[2][1],
    };
  } catch (error) {
    console.error('Error getting tokens:', error);
    return null;
  }
};

/**
 * Clear all stored tokens (logout)
 */
export const clearTokens = async () => {
  try {
    await AsyncStorage.multiRemove([
      AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN,
      AUTH_CONFIG.STORAGE_KEYS.ID_TOKEN,
      AUTH_CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
      AUTH_CONFIG.STORAGE_KEYS.USER_DATA,
      AUTH_CONFIG.STORAGE_KEYS.CUSTOMER_ID,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing tokens:', error);
    return false;
  }
};

/**
 * Get the access token for API calls
 */
export const getAccessToken = async () => {
  try {
    return await AsyncStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

/**
 * Store customer ID after successful login
 */
export const storeCustomerId = async (customerId) => {
  try {
    await AsyncStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.CUSTOMER_ID, String(customerId));
    return true;
  } catch (error) {
    console.error('Error storing customer ID:', error);
    return false;
  }
};

/**
 * Get stored customer ID
 */
export const getCustomerId = async () => {
  try {
    const id = await AsyncStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.CUSTOMER_ID);
    return id ? parseInt(id, 10) : null;
  } catch (error) {
    console.error('Error getting customer ID:', error);
    return null;
  }
};

// =============================================================================
// JWT HELPERS
// =============================================================================

/**
 * Decode a JWT token (without verification)
 */
export const decodeToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if a token is expired
 */
export const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  return decoded.exp * 1000 < Date.now();
};

// =============================================================================
// AUTHENTICATION API CALLS
// =============================================================================

/**
 * Register a new user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 */
export const register = async (email, password, firstName = '', lastName = '') => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password,
        first_name: firstName,
        last_name: lastName,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Registration failed',
        code: data.code,
      };
    }
    
    return {
      success: true,
      userSub: data.user_sub,
      email: data.email,
      confirmed: data.confirmed,
      message: data.message,
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Confirm user registration with verification code
 * @param {string} email - User's email
 * @param {string} code - Verification code from email
 */
export const confirmRegistration = async (email, code) => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        code: code.trim(),
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Confirmation failed',
      };
    }
    
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error('Confirmation error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Resend verification code
 * @param {string} email - User's email
 */
export const resendVerificationCode = async (email) => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/resend-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to resend code',
      };
    }
    
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error('Resend code error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Login user
 * @param {string} email - User's email
 * @param {string} password - User's password
 */
export const login = async (email, password) => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Login failed',
        code: data.code,
      };
    }
    
    // Check for challenge (like password reset required)
    if (data.challenge) {
      return {
        success: false,
        challenge: data.challenge,
        session: data.session,
        message: data.message,
      };
    }
    
    // Store tokens
    await storeTokens({
      access_token: data.access_token,
      id_token: data.id_token,
      refresh_token: data.refresh_token,
    });
    
    return {
      success: true,
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async () => {
  try {
    const tokens = await getTokens();
    
    if (!tokens || !tokens.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
      };
    }
    
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: tokens.refreshToken,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // If refresh fails, user needs to login again
      await clearTokens();
      return {
        success: false,
        error: data.error || 'Token refresh failed. Please login again.',
        requiresLogin: true,
      };
    }
    
    // Store new tokens (refresh token stays the same)
    await storeTokens({
      access_token: data.access_token,
      id_token: data.id_token,
      refresh_token: tokens.refreshToken,
    });
    
    return {
      success: true,
      accessToken: data.access_token,
      idToken: data.id_token,
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Initiate forgot password flow
 * @param {string} email - User's email
 */
export const forgotPassword = async (email) => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to initiate password reset',
      };
    }
    
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error('Forgot password error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Confirm forgot password with code and new password
 * @param {string} email - User's email
 * @param {string} code - Reset code from email
 * @param {string} newPassword - New password
 */
export const confirmForgotPassword = async (email, code, newPassword) => {
  try {
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/confirm-forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        code: code.trim(),
        new_password: newPassword,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Password reset failed',
      };
    }
    
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error('Confirm forgot password error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Change password for authenticated user
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 */
export const changePassword = async (oldPassword, newPassword) => {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return {
        success: false,
        error: 'Not authenticated',
        requiresLogin: true,
      };
    }
    
    const response = await fetch(`${AUTH_CONFIG.API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Password change failed',
      };
    }
    
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error('Change password error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Logout user - clear all tokens
 */
export const logout = async () => {
  await clearTokens();
  return { success: true };
};

// =============================================================================
// AUTHENTICATED API HELPERS
// =============================================================================

/**
 * Make an authenticated API request
 * Automatically handles token refresh if needed
 */
export const authenticatedFetch = async (url, options = {}) => {
  let accessToken = await getAccessToken();
  
  // Check if token is expired and refresh if needed
  if (accessToken && isTokenExpired(accessToken)) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.success) {
      accessToken = refreshResult.accessToken;
    } else {
      return {
        ok: false,
        error: 'Session expired. Please login again.',
        requiresLogin: true,
      };
    }
  }
  
  if (!accessToken) {
    return {
      ok: false,
      error: 'Not authenticated',
      requiresLogin: true,
    };
  }
  
  // Add authorization header
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`,
  };
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // If unauthorized, try refreshing token once
    if (response.status === 401) {
      const refreshResult = await refreshAccessToken();
      if (refreshResult.success) {
        // Retry with new token
        const retryResponse = await fetch(url, {
          ...options,
          headers: {
            ...headers,
            'Authorization': `Bearer ${refreshResult.accessToken}`,
          },
        });
        return retryResponse;
      } else {
        return {
          ok: false,
          error: 'Session expired. Please login again.',
          requiresLogin: true,
        };
      }
    }
    
    return response;
  } catch (error) {
    console.error('Authenticated fetch error:', error);
    throw error;
  }
};

/**
 * Get user profile from protected endpoint
 */
export const getMyProfile = async () => {
  try {
    const response = await authenticatedFetch(`${AUTH_CONFIG.API_URL}/customers/me`);
    
    if (response.requiresLogin) {
      return response;
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get profile',
      };
    }
    
    // Store customer ID
    if (data.customer_id) {
      await storeCustomerId(data.customer_id);
    }
    
    return {
      success: true,
      profile: data,
    };
  } catch (error) {
    console.error('Get profile error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

/**
 * Update user profile
 */
export const updateMyProfile = async (profileData) => {
  try {
    const response = await authenticatedFetch(`${AUTH_CONFIG.API_URL}/customers/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });
    
    if (response.requiresLogin) {
      return response;
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to update profile',
      };
    }
    
    return {
      success: true,
      profile: data,
    };
  } catch (error) {
    console.error('Update profile error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
};

// =============================================================================
// CHECK AUTHENTICATION STATE
// =============================================================================

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async () => {
  const tokens = await getTokens();
  
  if (!tokens || !tokens.accessToken) {
    return false;
  }
  
  // If access token is expired, try to refresh
  if (isTokenExpired(tokens.accessToken)) {
    if (tokens.refreshToken) {
      const refreshResult = await refreshAccessToken();
      return refreshResult.success;
    }
    return false;
  }
  
  return true;
};

/**
 * Get current user info from stored ID token
 */
export const getCurrentUser = async () => {
  const tokens = await getTokens();
  
  if (!tokens || !tokens.idToken) {
    return null;
  }
  
  const decoded = decodeToken(tokens.idToken);
  
  if (!decoded) {
    return null;
  }
  
  return {
    sub: decoded.sub,
    email: decoded.email,
    emailVerified: decoded.email_verified,
    customerId: decoded['custom:customer_id'],
  };
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Token management
  storeTokens,
  getTokens,
  clearTokens,
  getAccessToken,
  storeCustomerId,
  getCustomerId,
  
  // JWT helpers
  decodeToken,
  isTokenExpired,
  
  // Auth operations
  register,
  confirmRegistration,
  resendVerificationCode,
  login,
  refreshAccessToken,
  forgotPassword,
  confirmForgotPassword,
  changePassword,
  logout,
  
  // Authenticated requests
  authenticatedFetch,
  getMyProfile,
  updateMyProfile,
  
  // State checks
  isAuthenticated,
  getCurrentUser,
  
  // Config
  AUTH_CONFIG,
};
