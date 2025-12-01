// Login Page JavaScript Module
// Handles email/password authentication, Google login with username setup, and forgot password

let firebaseModule = null;

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Calculate password strength (0-100)
function calculatePasswordStrength(password) {
  let strength = 0;
  
  if (!password) return 0;
  
  // Length checks
  if (password.length >= 6) strength += 25;
  if (password.length >= 10) strength += 25;
  
  // Mixed case
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
  
  // Contains number
  if (/\d/.test(password)) strength += 25;
  
  return strength;
}

// Get strength label
function getStrengthLabel(strength) {
  if (strength < 50) return { text: "Lemah 🔴", class: "weak" };
  if (strength < 75) return { text: "Sedang 🟠", class: "medium" };
  return { text: "Kuat 🟢", class: "strong" };
}

// DOM Elements
const elements = {
  // Login form elements
  emailLoginSection: document.getElementById("email-login-section"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginEmailError: document.getElementById("login-email-error"),
  loginPasswordError: document.getElementById("login-password-error"),
  emailLoginBtn: document.getElementById("email-login-btn"),
  rememberMe: document.getElementById("remember-me"),
  forgotPasswordLink: document.getElementById("forgot-password-link"),
  showRegisterLink: document.getElementById("show-register"),
  
  // Register form elements
  emailRegisterSection: document.getElementById("email-register-section"),
  registerUsername: document.getElementById("register-username"),
  registerEmail: document.getElementById("register-email"),
  registerPassword: document.getElementById("register-password"),
  registerPasswordConfirm: document.getElementById("register-password-confirm"),
  registerUsernameError: document.getElementById("register-username-error"),
  registerUsernameSuccess: document.getElementById("register-username-success"),
  registerEmailError: document.getElementById("register-email-error"),
  registerPasswordError: document.getElementById("register-password-error"),
  registerPasswordConfirmError: document.getElementById("register-password-confirm-error"),
  emailRegisterBtn: document.getElementById("email-register-btn"),
  showLoginLink: document.getElementById("show-login"),
  strengthFill: document.getElementById("strength-fill"),
  strengthText: document.getElementById("strength-text"),
  
  // Google login elements
  googleLoginBtn: document.getElementById("google-login-btn"),
  
  // Username modal (for Google users)
  usernameModal: document.getElementById("username-modal"),
  googleUserEmail: document.getElementById("google-user-email"),
  googleUsername: document.getElementById("google-username"),
  googleUsernameError: document.getElementById("google-username-error"),
  googleUsernameSuccess: document.getElementById("google-username-success"),
  saveUsernameBtn: document.getElementById("save-username-btn"),
  
  // Forgot password modal
  forgotModal: document.getElementById("forgot-modal"),
  forgotEmail: document.getElementById("forgot-email"),
  forgotEmailError: document.getElementById("forgot-email-error"),
  sendResetBtn: document.getElementById("send-reset-btn"),
  resetSuccess: document.getElementById("reset-success"),
  closeForgotModal: document.getElementById("close-forgot-modal"),
  
  // Guest button
  guestBtn: document.getElementById("guest-btn"),
  
  // Error container
  errorContainer: document.getElementById("error-container")
};

// Current Google user waiting for username
let pendingGoogleUser = null;

// Validation request counters to prevent race conditions
let registerUsernameValidationId = 0;
let googleUsernameValidationId = 0;

// Load Firebase module
async function loadFirebase() {
  if (firebaseModule) return firebaseModule;
  
  try {
    firebaseModule = await import('./firebase-config.js');
    return firebaseModule;
  } catch (error) {
    console.warn('Firebase module not available:', error);
    return null;
  }
}

// Toggle between login and register forms
function toggleForms(showRegister) {
  if (showRegister) {
    elements.emailLoginSection.classList.add("hidden");
    elements.emailRegisterSection.classList.remove("hidden");
  } else {
    elements.emailLoginSection.classList.remove("hidden");
    elements.emailRegisterSection.classList.add("hidden");
  }
  clearAllErrors();
}

// Clear all error messages
function clearAllErrors() {
  const errorElements = document.querySelectorAll('.error');
  errorElements.forEach(el => el.textContent = '');
  
  const successElements = document.querySelectorAll('.success');
  successElements.forEach(el => el.classList.add('hidden'));
  
  if (elements.errorContainer) {
    elements.errorContainer.classList.add('hidden');
  }
}

// Show error message
function showError(element, message) {
  if (element) {
    element.textContent = message;
  }
}

// Show global error
function showGlobalError(message) {
  if (elements.errorContainer) {
    elements.errorContainer.textContent = message;
    elements.errorContainer.classList.remove('hidden');
  }
}

// Hide global error
function hideGlobalError() {
  if (elements.errorContainer) {
    elements.errorContainer.classList.add('hidden');
  }
}

// Set loading state on button
function setLoading(btn, loading, originalContent = null) {
  if (!btn) return;
  
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="loading-spinner"></div> Memuat...';
    btn.classList.add('btn-loading');
  } else {
    btn.disabled = false;
    btn.innerHTML = originalContent || btn.dataset.originalContent || btn.innerHTML;
    btn.classList.remove('btn-loading');
  }
}

// Check username availability (debounced) with race condition protection
function createUsernameChecker(validationIdKey) {
  return debounce(async (username, errorEl, successEl, buttonToUpdate = null) => {
    // Increment validation ID to track this request
    const currentValidationId = validationIdKey === 'register' 
      ? ++registerUsernameValidationId 
      : ++googleUsernameValidationId;
    
    if (!username) {
      showError(errorEl, '');
      successEl?.classList.add('hidden');
      if (buttonToUpdate) buttonToUpdate.disabled = true;
      return false;
    }
    
    const firebase = await loadFirebase();
    if (!firebase) {
      showError(errorEl, 'Firebase tidak tersedia');
      if (buttonToUpdate) buttonToUpdate.disabled = true;
      return false;
    }
    
    // Validate format first
    const validation = firebase.validateUsername(username);
    if (!validation.valid) {
      showError(errorEl, validation.error);
      successEl?.classList.add('hidden');
      if (buttonToUpdate) buttonToUpdate.disabled = true;
      return false;
    }
    
    // Check availability
    const isAvailable = await firebase.checkUsernameAvailable(username);
    
    // Check if this is still the latest validation request
    const latestId = validationIdKey === 'register' 
      ? registerUsernameValidationId 
      : googleUsernameValidationId;
    
    if (currentValidationId !== latestId) {
      // A newer validation request has been made, ignore this result
      return false;
    }
    
    if (isAvailable) {
      showError(errorEl, '');
      successEl?.classList.remove('hidden');
      if (buttonToUpdate) buttonToUpdate.disabled = false;
      return true;
    } else {
      showError(errorEl, 'Username sudah digunakan');
      successEl?.classList.add('hidden');
      if (buttonToUpdate) buttonToUpdate.disabled = true;
      return false;
    }
  }, 500);
}

// Create separate checkers for register and Google username forms
const checkRegisterUsername = createUsernameChecker('register');
const checkGoogleUsername = createUsernameChecker('google');

// Update password strength indicator
function updatePasswordStrength(password) {
  const strength = calculatePasswordStrength(password);
  const label = getStrengthLabel(strength);
  
  if (elements.strengthFill) {
    elements.strengthFill.style.width = `${strength}%`;
    elements.strengthFill.className = `strength-fill ${label.class}`;
  }
  
  if (elements.strengthText) {
    elements.strengthText.textContent = label.text;
    elements.strengthText.className = `strength-text ${label.class}`;
  }
}

// Handle email login
async function handleEmailLogin(e) {
  e.preventDefault();
  clearAllErrors();
  
  const email = elements.loginEmail?.value?.trim();
  const password = elements.loginPassword?.value;
  
  // Basic validation
  if (!email) {
    showError(elements.loginEmailError, 'Email wajib diisi');
    return;
  }
  
  if (!password) {
    showError(elements.loginPasswordError, 'Password wajib diisi');
    return;
  }
  
  const firebase = await loadFirebase();
  if (!firebase) {
    showGlobalError('Firebase tidak tersedia. Silakan gunakan mode tamu.');
    return;
  }
  
  setLoading(elements.emailLoginBtn, true);
  
  const result = await firebase.signInWithEmail(email, password);
  
  if (result.success) {
    // Handle remember me
    if (elements.rememberMe?.checked) {
      localStorage.setItem('rememberedEmail', email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
    window.location.href = 'index.html';
  } else {
    setLoading(elements.emailLoginBtn, false, 'Login');
    showGlobalError(result.error);
  }
}

// Handle email register
async function handleEmailRegister(e) {
  e.preventDefault();
  clearAllErrors();
  
  const username = elements.registerUsername?.value?.trim();
  const email = elements.registerEmail?.value?.trim();
  const password = elements.registerPassword?.value;
  const passwordConfirm = elements.registerPasswordConfirm?.value;
  
  // Validate all fields
  let hasError = false;
  
  if (!username) {
    showError(elements.registerUsernameError, 'Username wajib diisi');
    hasError = true;
  }
  
  if (!email) {
    showError(elements.registerEmailError, 'Email wajib diisi');
    hasError = true;
  }
  
  if (!password) {
    showError(elements.registerPasswordError, 'Password wajib diisi');
    hasError = true;
  } else if (password.length < 6) {
    showError(elements.registerPasswordError, 'Password minimal 6 karakter');
    hasError = true;
  }
  
  if (password !== passwordConfirm) {
    showError(elements.registerPasswordConfirmError, 'Password tidak cocok');
    hasError = true;
  }
  
  if (hasError) return;
  
  const firebase = await loadFirebase();
  if (!firebase) {
    showGlobalError('Firebase tidak tersedia. Silakan gunakan mode tamu.');
    return;
  }
  
  // Validate username format
  const usernameValidation = firebase.validateUsername(username);
  if (!usernameValidation.valid) {
    showError(elements.registerUsernameError, usernameValidation.error);
    return;
  }
  
  setLoading(elements.emailRegisterBtn, true);
  
  const result = await firebase.registerWithEmail(email, password, username);
  
  if (result.success) {
    window.location.href = 'index.html';
  } else {
    setLoading(elements.emailRegisterBtn, false, 'Daftar');
    showGlobalError(result.error);
  }
}

// Handle Google login
async function handleGoogleLogin() {
  clearAllErrors();
  
  const firebase = await loadFirebase();
  if (!firebase) {
    showGlobalError('Firebase tidak tersedia. Silakan gunakan mode tamu.');
    return;
  }
  
  const originalContent = elements.googleLoginBtn?.innerHTML;
  setLoading(elements.googleLoginBtn, true);
  
  const result = await firebase.signInWithGoogle();
  
  if (result.success) {
    if (result.needsUsername) {
      // Show username setup modal
      setLoading(elements.googleLoginBtn, false, originalContent);
      pendingGoogleUser = result.user;
      showUsernameModal(result.user);
    } else {
      // User already has username, proceed
      window.location.href = 'index.html';
    }
  } else {
    setLoading(elements.googleLoginBtn, false, originalContent);
    if (result.error) {
      showGlobalError(result.error);
    }
  }
}

// Show username setup modal for Google users
function showUsernameModal(user) {
  if (elements.usernameModal) {
    elements.usernameModal.classList.remove('hidden');
  }
  
  if (elements.googleUserEmail) {
    elements.googleUserEmail.textContent = user.email;
  }
  
  if (elements.googleUsername) {
    elements.googleUsername.value = '';
    elements.googleUsername.focus();
  }
  
  if (elements.saveUsernameBtn) {
    elements.saveUsernameBtn.disabled = true;
  }
  
  // Clear any previous errors/success
  if (elements.googleUsernameError) {
    elements.googleUsernameError.textContent = '';
  }
  if (elements.googleUsernameSuccess) {
    elements.googleUsernameSuccess.classList.add('hidden');
  }
}

// Hide username modal
function hideUsernameModal() {
  if (elements.usernameModal) {
    elements.usernameModal.classList.add('hidden');
  }
  pendingGoogleUser = null;
}

// Handle username setup for Google users
async function handleUsernameSetup() {
  if (!pendingGoogleUser) return;
  
  const username = elements.googleUsername?.value?.trim();
  
  if (!username) {
    showError(elements.googleUsernameError, 'Username wajib diisi');
    return;
  }
  
  const firebase = await loadFirebase();
  if (!firebase) {
    showError(elements.googleUsernameError, 'Firebase tidak tersedia');
    return;
  }
  
  // Validate username format
  const validation = firebase.validateUsername(username);
  if (!validation.valid) {
    showError(elements.googleUsernameError, validation.error);
    return;
  }
  
  setLoading(elements.saveUsernameBtn, true);
  
  const result = await firebase.saveUsernameForGoogleUser(pendingGoogleUser.uid, username);
  
  if (result.success) {
    hideUsernameModal();
    window.location.href = 'index.html';
  } else {
    setLoading(elements.saveUsernameBtn, false, 'Lanjutkan');
    showError(elements.googleUsernameError, result.error);
  }
}

// Show forgot password modal
function showForgotModal() {
  if (elements.forgotModal) {
    elements.forgotModal.classList.remove('hidden');
  }
  
  if (elements.forgotEmail) {
    elements.forgotEmail.value = elements.loginEmail?.value || '';
    elements.forgotEmail.focus();
  }
  
  if (elements.forgotEmailError) {
    elements.forgotEmailError.textContent = '';
  }
  
  if (elements.resetSuccess) {
    elements.resetSuccess.classList.add('hidden');
  }
}

// Hide forgot password modal
function hideForgotModal() {
  if (elements.forgotModal) {
    elements.forgotModal.classList.add('hidden');
  }
}

// Handle forgot password
async function handleForgotPassword() {
  const email = elements.forgotEmail?.value?.trim();
  
  if (!email) {
    showError(elements.forgotEmailError, 'Email wajib diisi');
    return;
  }
  
  const firebase = await loadFirebase();
  if (!firebase) {
    showError(elements.forgotEmailError, 'Firebase tidak tersedia');
    return;
  }
  
  setLoading(elements.sendResetBtn, true);
  
  const result = await firebase.resetPassword(email);
  
  setLoading(elements.sendResetBtn, false, 'Kirim Link Reset');
  
  if (result.success) {
    if (elements.forgotEmailError) {
      elements.forgotEmailError.textContent = '';
    }
    if (elements.resetSuccess) {
      elements.resetSuccess.classList.remove('hidden');
    }
  } else {
    showError(elements.forgotEmailError, result.error);
  }
}

// Handle guest mode
function handleGuestMode() {
  localStorage.setItem('guestMode', 'true');
  window.location.href = 'index.html';
}

// Toggle password visibility
function togglePasswordVisibility(inputEl, toggleBtn) {
  if (!inputEl) return;
  
  if (inputEl.type === 'password') {
    inputEl.type = 'text';
    if (toggleBtn) toggleBtn.textContent = '🙈';
  } else {
    inputEl.type = 'password';
    if (toggleBtn) toggleBtn.textContent = '👁️';
  }
}

// Initialize event listeners
function initEventListeners() {
  // Form toggle links
  elements.showRegisterLink?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleForms(true);
  });
  
  elements.showLoginLink?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleForms(false);
  });
  
  // Email login form
  elements.emailLoginBtn?.addEventListener('click', handleEmailLogin);
  
  // Email register form
  elements.emailRegisterBtn?.addEventListener('click', handleEmailRegister);
  
  // Google login
  elements.googleLoginBtn?.addEventListener('click', handleGoogleLogin);
  
  // Guest mode
  elements.guestBtn?.addEventListener('click', handleGuestMode);
  
  // Username availability check (register form)
  elements.registerUsername?.addEventListener('input', (e) => {
    const username = e.target.value;
    checkRegisterUsername(username, elements.registerUsernameError, elements.registerUsernameSuccess);
  });
  
  // Username availability check (Google modal) - pass the button to update
  elements.googleUsername?.addEventListener('input', (e) => {
    const username = e.target.value;
    checkGoogleUsername(username, elements.googleUsernameError, elements.googleUsernameSuccess, elements.saveUsernameBtn);
  });
  
  // Password strength indicator
  elements.registerPassword?.addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
  });
  
  // Password visibility toggles
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      togglePasswordVisibility(input, btn);
    });
  });
  
  // Forgot password link
  elements.forgotPasswordLink?.addEventListener('click', (e) => {
    e.preventDefault();
    showForgotModal();
  });
  
  // Close forgot modal
  elements.closeForgotModal?.addEventListener('click', hideForgotModal);
  
  // Send reset button
  elements.sendResetBtn?.addEventListener('click', handleForgotPassword);
  
  // Save username button (Google modal)
  elements.saveUsernameBtn?.addEventListener('click', handleUsernameSetup);
  
  // Close modals on backdrop click
  elements.forgotModal?.addEventListener('click', (e) => {
    if (e.target === elements.forgotModal) {
      hideForgotModal();
    }
  });
  
  // Enter key handlers for forms
  elements.loginEmail?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.loginPassword?.focus();
  });
  
  elements.loginPassword?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleEmailLogin(e);
  });
  
  elements.registerUsername?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.registerEmail?.focus();
  });
  
  elements.registerEmail?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.registerPassword?.focus();
  });
  
  elements.registerPassword?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.registerPasswordConfirm?.focus();
  });
  
  elements.registerPasswordConfirm?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleEmailRegister(e);
  });
  
  elements.googleUsername?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !elements.saveUsernameBtn?.disabled) {
      handleUsernameSetup();
    }
  });
  
  elements.forgotEmail?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleForgotPassword();
  });
}

// Check if already authenticated
async function checkExistingAuth() {
  const firebase = await loadFirebase();
  if (!firebase) return;
  
  try {
    const authState = await firebase.initAuth();
    
    // Only redirect if user is logged in with a real account (not guest)
    if (authState.isAuthenticated && !authState.isGuest && authState.user) {
      // Check if user has username
      const profileResult = await firebase.getUserProfile(authState.user.uid);
      
      if (profileResult.success && profileResult.profile?.username) {
        window.location.href = 'index.html';
      }
      // If no username, let them stay on login page (they'll go through username setup)
    }
  } catch (error) {
    console.error('Auth check error:', error);
  }
}

// Load remembered email
function loadRememberedEmail() {
  const rememberedEmail = localStorage.getItem('rememberedEmail');
  if (rememberedEmail && elements.loginEmail) {
    elements.loginEmail.value = rememberedEmail;
    if (elements.rememberMe) {
      elements.rememberMe.checked = true;
    }
  }
}

// Initialize
async function init() {
  initEventListeners();
  loadRememberedEmail();
  await checkExistingAuth();
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
