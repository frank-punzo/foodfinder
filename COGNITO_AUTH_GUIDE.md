# AWS Cognito Authentication Implementation Guide for NutriSnap

This guide explains how to add AWS Cognito authentication to your NutriSnap application.

## Overview

The authentication system provides:
- **User Registration** with email verification
- **Login/Logout** functionality
- **Password Reset** (Forgot Password)
- **Token Management** with automatic refresh
- **Protected API Routes** requiring authentication

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Native   │────▶│  API Gateway     │────▶│  Lambda         │
│  App            │     │  (JWT Authorizer)│     │  (handler.py)   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
        │                        │                        │
        │                        │                        ▼
        │                  ┌─────▼─────┐          ┌───────────────┐
        │                  │  Cognito  │          │  PostgreSQL   │
        └─────────────────▶│  User Pool│          │  (RDS)        │
                           └───────────┘          └───────────────┘
```

## Step 1: Database Migration

Run this SQL to add Cognito support to your customers table:

```sql
-- Add cognito_sub column to link Cognito users to customer records
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS cognito_sub VARCHAR(255) UNIQUE;

-- Add email column for login identification
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) UNIQUE;

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_customers_cognito_sub ON customers(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(customer_email);

-- Add comments
COMMENT ON COLUMN customers.cognito_sub IS 'AWS Cognito User Pool subject (unique user identifier)';
COMMENT ON COLUMN customers.customer_email IS 'Customer email address used for authentication';
```

## Step 2: Deploy Terraform Infrastructure

### 2.1 Update terraform.tfvars

Add or update these values in your `terraform/terraform.tfvars`:

```hcl
# Existing configuration
aws_region       = "us-east-1"
project_name     = "food-finder"
environment      = "dev"

db_host          = "your-rds-endpoint.amazonaws.com"
db_port          = "5432"
db_name          = "foodfinder"
db_user          = "postgres"
db_secret_name   = "foodfinderdbpw"

use_existing_vpc    = true
existing_vpc_id     = "vpc-xxxxxxxx"
existing_subnet_ids = ["subnet-xxxxxxxx", "subnet-yyyyyyyy"]

# Cognito configuration (optional overrides)
cognito_password_min_length       = 8
cognito_password_require_uppercase = true
cognito_password_require_lowercase = true
cognito_password_require_numbers   = true
cognito_password_require_symbols   = false
cognito_mfa_configuration          = "OFF"  # or "OPTIONAL" or "ON"

# Token validity
cognito_access_token_validity  = 1   # hours
cognito_id_token_validity      = 1   # hours
cognito_refresh_token_validity = 30  # days

# OAuth callback URLs (update for production)
cognito_callback_urls = ["nutrisnap://callback", "exp://localhost:8081/--/callback"]
cognito_logout_urls   = ["nutrisnap://logout", "exp://localhost:8081/--/logout"]
```

### 2.2 Deploy

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### 2.3 Save Outputs

After deployment, save these values for your React Native app:

```bash
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output api_endpoint
```

## Step 3: Update React Native App

### 3.1 Update Configuration

Update `services/authService.js` with your deployed values:

```javascript
export const AUTH_CONFIG = {
  API_URL: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev',
  // ... rest of config
};
```

### 3.2 Add Authentication Flow to App.js

Add this authentication wrapper to your App.js:

```javascript
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LoginScreen, RegisterScreen, ForgotPasswordScreen } from './screens/AuthScreens';
import { isAuthenticated, getMyProfile, logout } from './services/authService';

export default function App() {
  const [authState, setAuthState] = useState('loading'); // 'loading', 'login', 'register', 'forgot', 'authenticated'
  const [registerData, setRegisterData] = useState({});
  const [customerId, setCustomerId] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      // Get user profile to get customer_id
      const profileResult = await getMyProfile();
      if (profileResult.success) {
        setCustomerId(profileResult.profile.customer_id);
        setAuthState('authenticated');
      } else {
        setAuthState('login');
      }
    } else {
      setAuthState('login');
    }
  };

  const handleLogin = async (result) => {
    // After successful login, get profile
    const profileResult = await getMyProfile();
    if (profileResult.success) {
      setCustomerId(profileResult.profile.customer_id);
    }
    setAuthState('authenticated');
  };

  const handleLogout = async () => {
    await logout();
    setCustomerId(null);
    setAuthState('login');
  };

  // Loading state
  if (authState === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator size="large" color="#4ECDC4" />
      </View>
    );
  }

  // Auth screens
  if (authState === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onNavigateToRegister={(data) => {
          setRegisterData(data);
          setAuthState('register');
        }}
        onNavigateToForgotPassword={() => setAuthState('forgot')}
      />
    );
  }

  if (authState === 'register') {
    return (
      <RegisterScreen
        initialData={registerData}
        onRegisterSuccess={() => setAuthState('login')}
        onNavigateToLogin={() => setAuthState('login')}
      />
    );
  }

  if (authState === 'forgot') {
    return (
      <ForgotPasswordScreen
        onNavigateToLogin={() => setAuthState('login')}
      />
    );
  }

  // Main app (authenticated)
  // Replace API_CONFIG.CUSTOMER_ID with customerId from state
  return (
    <MainApp customerId={customerId} onLogout={handleLogout} />
  );
}
```

### 3.3 Update API Calls to Use Protected Endpoints

Replace your existing API calls with authenticated versions:

```javascript
import { authenticatedFetch, AUTH_CONFIG } from './services/authService';

// OLD (public endpoint)
const response = await fetch(`${API_CONFIG.DATABASE_API_URL}/food-entries/by-date?customer_id=${customerId}&date=${date}`);

// NEW (protected endpoint - no customer_id needed, auto-detected from token)
const response = await authenticatedFetch(`${AUTH_CONFIG.API_URL}/my/food-entries/by-date?date=${date}`);
```

## API Endpoints Reference

### Public Endpoints (no authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/confirm | Confirm email verification |
| POST | /auth/resend-code | Resend verification code |
| POST | /auth/login | Login and get tokens |
| POST | /auth/refresh | Refresh access token |
| POST | /auth/forgot-password | Start password reset |
| POST | /auth/confirm-forgot-password | Complete password reset |
| GET | /health | Health check |

### Protected Endpoints (require Authorization header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /customers/me | Get authenticated user's profile |
| PUT | /customers/me | Update authenticated user's profile |
| GET | /my/food-entries | Get user's food entries |
| GET | /my/food-entries/by-date | Get entries by date/range |
| POST | /my/food-entries | Create food entry |
| PUT | /my/food-entries/{id} | Update food entry |
| DELETE | /my/food-entries/{id} | Delete food entry |
| GET | /my/daily-summary | Get daily nutrition summary |
| POST | /auth/change-password | Change password |

## Authentication Flow Examples

### Register New User

```javascript
import { register, confirmRegistration } from './services/authService';

// Step 1: Register
const result = await register('user@email.com', 'Password123', 'John', 'Doe');
if (result.success) {
  // User will receive email with verification code
  console.log('Check email for verification code');
}

// Step 2: Verify email
const verifyResult = await confirmRegistration('user@email.com', '123456');
if (verifyResult.success) {
  console.log('Email verified! User can now login');
}
```

### Login

```javascript
import { login, getMyProfile } from './services/authService';

const result = await login('user@email.com', 'Password123');
if (result.success) {
  // Tokens are automatically stored
  const profile = await getMyProfile();
  console.log('Customer ID:', profile.profile.customer_id);
}
```

### Forgot Password

```javascript
import { forgotPassword, confirmForgotPassword } from './services/authService';

// Step 1: Request reset code
await forgotPassword('user@email.com');

// Step 2: Reset with code
const result = await confirmForgotPassword('user@email.com', '123456', 'NewPassword123');
```

### Make Authenticated API Call

```javascript
import { authenticatedFetch, AUTH_CONFIG } from './services/authService';

const response = await authenticatedFetch(`${AUTH_CONFIG.API_URL}/my/food-entries/by-date?date=2025-12-25`);
const data = await response.json();
```

## Security Considerations

1. **Token Storage**: Tokens are stored in AsyncStorage. For production, consider using expo-secure-store.

2. **HTTPS**: Always use HTTPS in production.

3. **Token Refresh**: The authenticatedFetch function automatically handles token refresh.

4. **Password Requirements**: Configure password policy in Terraform variables.

5. **MFA**: Can be enabled by setting `cognito_mfa_configuration = "OPTIONAL"` or `"ON"`.

## File Structure

```
food-finder-api/
├── terraform/
│   ├── main.tf          # Main infrastructure
│   ├── cognito.tf       # Cognito resources
│   ├── variables.tf     # Variables with Cognito settings
│   └── outputs.tf       # Output values
├── lambda/
│   ├── handler.py       # Main Lambda handler
│   └── auth_handler.py  # Authentication handlers
└── sql/
    └── add_cognito_auth.sql  # Database migration

food-calorie-tracker/
├── App.js               # Main app with auth wrapper
├── services/
│   └── authService.js   # Authentication service
└── screens/
    └── AuthScreens.js   # Login, Register, Forgot Password screens
```

## Testing

### Test Registration

```bash
curl -X POST https://YOUR_API/dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Password123", "first_name": "Test", "last_name": "User"}'
```

### Test Login

```bash
curl -X POST https://YOUR_API/dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Password123"}'
```

### Test Protected Endpoint

```bash
curl -X GET https://YOUR_API/dev/customers/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Troubleshooting

### "User not confirmed" error
The user registered but hasn't verified their email. Resend the verification code.

### Token expired errors
The authenticatedFetch function handles this automatically. If issues persist, have the user log in again.

### CORS errors
Ensure your API Gateway CORS configuration includes your app's domain.

### Cognito "Invalid password" error
Password doesn't meet requirements. Default: 8+ chars, uppercase, lowercase, number.

## Cost Estimates

- **Cognito**: Free for first 50,000 MAU, then $0.0055/MAU
- **Secrets Manager VPC Endpoint**: ~$7/month per AZ
- **API Gateway**: $1.00 per million requests

## Next Steps

1. Run the database migration
2. Deploy Terraform infrastructure
3. Update App.js with authentication wrapper
4. Update API calls to use protected endpoints
5. Test the complete flow
