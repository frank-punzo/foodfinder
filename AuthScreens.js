// =============================================================================
// AUTHENTICATION SCREENS FOR NUTRISNAP
// =============================================================================
// This file contains all authentication-related screens:
// - Login
// - Register
// - Email Verification
// - Forgot Password
// - Reset Password
// =============================================================================

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  login,
  register,
  confirmRegistration,
  resendVerificationCode,
  forgotPassword,
  confirmForgotPassword,
} from './services/authService';

// =============================================================================
// LOGIN SCREEN
// =============================================================================

export const LoginScreen = ({ onLogin, onNavigateToRegister, onNavigateToForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        onLogin(result);
      } else if (result.code === 'USER_NOT_CONFIRMED') {
        Alert.alert(
          'Email Not Verified',
          'Please verify your email before logging in. Would you like to resend the verification code?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Resend Code', 
              onPress: () => onNavigateToRegister({ email, needsVerification: true })
            },
          ]
        );
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.gradient}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.logo}>🍎</Text>
              <Text style={styles.title}>NutriSnap</Text>
              <Text style={styles.subtitle}>AI-Powered Nutrition Tracking</Text>
            </View>

            {/* Login Form */}
            <View style={styles.formContainer}>
              <Text style={styles.formTitle}>Welcome Back</Text>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="Enter your password"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.showPasswordButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.showPasswordText}>
                      {showPassword ? '🙈' : '👁️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.forgotPasswordLink}
                onPress={onNavigateToForgotPassword}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#FF6B6B', '#FF8E53']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => onNavigateToRegister({})}
                disabled={isLoading}
              >
                <Text style={styles.secondaryButtonText}>Create New Account</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

// =============================================================================
// REGISTER SCREEN
// =============================================================================

export const RegisterScreen = ({ onRegisterSuccess, onNavigateToLogin, initialData = {} }) => {
  const [email, setEmail] = useState(initialData.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // If user needs verification, show that screen instead
  const [showVerification, setShowVerification] = useState(initialData.needsVerification || false);
  const [verificationCode, setVerificationCode] = useState('');

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validatePassword = (password) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
  };

  const handleRegister = async () => {
    // Validation
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (!validatePassword(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and numbers');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await register(email, password, firstName, lastName);

      if (result.success) {
        setShowVerification(true);
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await confirmRegistration(email, verificationCode);

      if (result.success) {
        Alert.alert(
          'Success!',
          'Your email has been verified. You can now log in.',
          [{ text: 'OK', onPress: onNavigateToLogin }]
        );
      } else {
        setError(result.error || 'Verification failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await resendVerificationCode(email);
      
      if (result.success) {
        Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verification Screen
  if (showVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.gradient}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Text style={styles.logo}>📧</Text>
                <Text style={styles.title}>Verify Email</Text>
                <Text style={styles.subtitle}>
                  We've sent a verification code to{'\n'}{email}
                </Text>
              </View>

              <View style={styles.formContainer}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Verification Code</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#666"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerify}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={['#4ECDC4', '#44A08D']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Verify Email</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={handleResendCode}
                  disabled={isLoading}
                >
                  <Text style={styles.linkText}>Didn't receive the code? Resend</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={onNavigateToLogin}
                >
                  <Text style={styles.linkText}>← Back to Login</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // Registration Form
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.gradient}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.logo}>🍎</Text>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Start your nutrition journey</Text>
            </View>

            <View style={styles.formContainer}>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.nameRow}>
                <View style={[styles.inputContainer, styles.halfInput]}>
                  <Text style={styles.inputLabel}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="John"
                    placeholderTextColor="#666"
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    editable={!isLoading}
                  />
                </View>

                <View style={[styles.inputContainer, styles.halfInput]}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Doe"
                    placeholderTextColor="#666"
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="Min 8 chars, uppercase, lowercase, number"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.showPasswordButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.showPasswordText}>
                      {showPassword ? '🙈' : '👁️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor="#666"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#4ECDC4', '#44A08D']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onNavigateToLogin}
              >
                <Text style={styles.linkText}>Already have an account? Sign In</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

// =============================================================================
// FORGOT PASSWORD SCREEN
// =============================================================================

export const ForgotPasswordScreen = ({ onNavigateToLogin }) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1 = enter email, 2 = enter code & new password
  const [showPassword, setShowPassword] = useState(false);

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await forgotPassword(email);

      if (result.success) {
        setStep(2);
      } else {
        setError(result.error || 'Failed to send reset code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim()) {
      setError('Please enter the reset code');
      return;
    }
    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await confirmForgotPassword(email, code, newPassword);

      if (result.success) {
        Alert.alert(
          'Password Reset',
          'Your password has been reset successfully. You can now log in with your new password.',
          [{ text: 'OK', onPress: onNavigateToLogin }]
        );
      } else {
        setError(result.error || 'Password reset failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.gradient}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.logo}>🔐</Text>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                {step === 1 
                  ? "Enter your email to receive a reset code"
                  : "Enter the code and your new password"
                }
              </Text>
            </View>

            <View style={styles.formContainer}>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {step === 1 ? (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="your@email.com"
                      placeholderTextColor="#666"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!isLoading}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                    onPress={handleSendCode}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={['#FF6B6B', '#FF8E53']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Send Reset Code</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Reset Code</Text>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      placeholder="Enter code from email"
                      placeholderTextColor="#666"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>New Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="Enter new password"
                        placeholderTextColor="#666"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showPassword}
                        editable={!isLoading}
                      />
                      <TouchableOpacity
                        style={styles.showPasswordButton}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <Text style={styles.showPasswordText}>
                          {showPassword ? '🙈' : '👁️'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm new password"
                      placeholderTextColor="#666"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      editable={!isLoading}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={['#4ECDC4', '#44A08D']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Reset Password</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={handleSendCode}
                    disabled={isLoading}
                  >
                    <Text style={styles.linkText}>Resend Code</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.linkButton}
                onPress={onNavigateToLogin}
              >
                <Text style={styles.linkText}>← Back to Login</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a0a0',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginRight: 8,
  },
  showPasswordButton: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
  },
  showPasswordText: {
    fontSize: 20,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#4ECDC4',
    fontSize: 14,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: '#666',
    marginHorizontal: 16,
    fontSize: 14,
  },
  linkButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkText: {
    color: '#4ECDC4',
    fontSize: 14,
  },
});

export default {
  LoginScreen,
  RegisterScreen,
  ForgotPasswordScreen,
};
