// =============================================================================
// FAT SECRET API SERVICE
// =============================================================================
// This service calls our backend API which proxies requests to FatSecret
// This avoids CORS issues that occur when calling FatSecret directly from browser
// =============================================================================

import Constants from 'expo-constants';

// Use the same API URL as the main app
//const API_URL = 'https://102rxnded9.execute-api.us-east-1.amazonaws.com/dev';
const API_URL = 'https://eljniup0wk.execute-api.us-east-1.amazonaws.com/prod'

/**
 * Search for foods by name
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results (default 20)
 * @param {number} pageNumber - Page number for pagination (default 0)
 * @returns {Promise<Object>} - Search results
 */
/**
 * Get detailed food information including all servings with full nutrition data
 * @param {string} foodId - FatSecret food ID
 * @returns {Promise<Object>} - Food details with servings
 */
export const getFoodDetails = async (foodId) => {
  try {
    const params = new URLSearchParams({
      food_id: foodId,
    });

    const response = await fetch(`${API_URL}/food-details?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Food details error:', errorText);
      throw new Error(`Food details failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.food) {
      return {
        success: true,
        food: {
          id: data.food.id,
          name: data.food.name,
          brandName: data.food.brand_name,
          type: data.food.type,
          servings: data.food.servings.map(serving => ({
            servingId: serving.serving_id,
            servingDescription: serving.serving_description,
            metricServingAmount: serving.metric_serving_amount,
            metricServingUnit: serving.metric_serving_unit,
            numberOfUnits: serving.number_of_units,
            measurementDescription: serving.measurement_description,
            calories: serving.calories || 0,
            carbs: serving.carbs || 0,
            protein: serving.protein || 0,
            fat: serving.fat || 0,
            fiber: serving.fiber || 0,
            sugar: serving.sugar || 0,
            sodium: serving.sodium || 0,
            saturatedFat: serving.saturated_fat || 0,
            cholesterol: serving.cholesterol || 0,
          })),
        },
      };
    }

    return {
      success: false,
      error: data.error || 'Unknown error',
      food: null,
    };
  } catch (error) {
    console.error('Error getting food details:', error);
    return {
      success: false,
      error: error.message,
      food: null,
    };
  }
};

export const searchFoods = async (query, maxResults = 20, pageNumber = 0) => {
  try {
    const params = new URLSearchParams({
      query: query,
      max_results: maxResults.toString(),
      page: pageNumber.toString(),
    });

    const response = await fetch(`${API_URL}/food-search?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Food search error:', errorText);
      throw new Error(`Food search failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.foods) {
      return {
        success: true,
        foods: data.foods.map(food => ({
          id: food.id,
          name: food.name,
          brandName: food.brand_name,
          type: food.type,
          servingDescription: food.serving_description,
          calories: food.calories || 0,
          fat: food.fat || 0,
          carbs: food.carbs || 0,
          protein: food.protein || 0,
          fiber: food.fiber || 0,
        })),
        totalResults: data.total_results || 0,
        pageNumber: data.page_number || 0,
        maxResults: data.max_results || maxResults,
      };
    }
    
    return {
      success: false,
      error: data.error || 'Unknown error',
      foods: [],
    };
  } catch (error) {
    console.error('Error searching foods:', error);
    return {
      success: false,
      error: error.message,
      foods: [],
    };
  }
};

/**
 * Calculate nutrition values for a given number of servings
 * @param {Object} baseNutrition - Base nutrition values per serving
 * @param {number} servings - Number of servings
 * @returns {Object} - Calculated nutrition values
 */
export const calculateServingNutrition = (baseNutrition, servings) => {
  const multiplier = parseFloat(servings) || 1;
  return {
    calories: Math.round(baseNutrition.calories * multiplier),
    protein: Math.round(baseNutrition.protein * multiplier * 10) / 10,
    carbs: Math.round(baseNutrition.carbs * multiplier * 10) / 10,
    fat: Math.round(baseNutrition.fat * multiplier * 10) / 10,
    fiber: Math.round((baseNutrition.fiber || 0) * multiplier * 10) / 10,
  };
};

export default {
  getFoodDetails,
  searchFoods,
  calculateServingNutrition,
};
