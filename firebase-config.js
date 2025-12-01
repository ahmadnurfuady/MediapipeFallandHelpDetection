// Firebase Configuration and Authentication Module
// For MediaPipe Fall and Help Detection System

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  limit,
  startAfter,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyl5uUUlf7LSqCePTwQSe2j_lqv17iXiM",
  authDomain: "aipakdhoto.firebaseapp.com",
  projectId: "aipakdhoto",
  storageBucket: "aipakdhoto.firebasestorage.app",
  messagingSenderId: "542499206190",
  appId: "1:542499206190:web:ad01bb9604f67880371bbf",
  measurementId: "G-W023RF9TBV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Auth state management
let currentUser = null;
let isGuestMode = false;

// Check if user is in guest mode
function checkGuestMode() {
  return localStorage.getItem("guestMode") === "true";
}

// Set guest mode
function setGuestMode(value) {
  isGuestMode = value;
  localStorage.setItem("guestMode", value.toString());
}

// Get current authentication state
function getCurrentAuthState() {
  return {
    user: currentUser,
    isGuest: isGuestMode,
    isAuthenticated: !!currentUser || isGuestMode
  };
}

// Validate username format
function validateUsername(username) {
  if (!username) {
    return { valid: false, error: "Username wajib diisi" };
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < 3) {
    return { valid: false, error: "Username minimal 3 karakter" };
  }
  
  if (trimmed.length > 20) {
    return { valid: false, error: "Username maksimal 20 karakter" };
  }
  
  // Check for spaces
  if (/\s/.test(trimmed)) {
    return { valid: false, error: "Username tidak boleh mengandung spasi" };
  }
  
  // Only alphanumeric and underscore allowed
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: "Username hanya boleh huruf, angka, dan underscore (_)" };
  }
  
  return { valid: true, error: null };
}

// Check if username is available (case-insensitive)
async function checkUsernameAvailable(username) {
  if (!username) return false;
  
  try {
    const usernameLower = username.toLowerCase().trim();
    const usernameDoc = await getDoc(doc(db, "usernames", usernameLower));
    return !usernameDoc.exists();
  } catch (error) {
    console.error("Error checking username:", error);
    return false;
  }
}

// Get user profile from Firestore
async function getUserProfile(userId) {
  if (!userId) {
    return { success: false, error: "User ID required", profile: null };
  }
  
  try {
    const profileDoc = await getDoc(doc(db, "users", userId, "profile", "info"));
    if (profileDoc.exists()) {
      return { success: true, profile: profileDoc.data(), error: null };
    }
    return { success: false, profile: null, error: "Profile not found" };
  } catch (error) {
    console.error("Error getting user profile:", error);
    return { success: false, profile: null, error: error.message };
  }
}

// Register with email/password
async function registerWithEmail(email, password, username) {
  // Validate username format
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return { success: false, error: usernameValidation.error, user: null };
  }
  
  const usernameLower = username.toLowerCase().trim();
  let user = null;
  
  try {
    // Create Firebase auth user first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    user = userCredential.user;
    
    // Use transaction to atomically check and reserve username
    await runTransaction(db, async (transaction) => {
      // Check if username is already taken within transaction
      const usernameDoc = await transaction.get(doc(db, "usernames", usernameLower));
      
      if (usernameDoc.exists()) {
        throw new Error("USERNAME_TAKEN");
      }
      
      // Reserve username
      transaction.set(doc(db, "usernames", usernameLower), {
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      
      // Save user profile
      transaction.set(doc(db, "users", user.uid, "profile", "info"), {
        username: usernameLower,
        displayUsername: username.trim(), // Preserve original case for display
        email: user.email,
        authProvider: "email",
        displayName: null,
        photoURL: null,
        createdAt: serverTimestamp()
      });
    });
    
    currentUser = user;
    isGuestMode = false;
    localStorage.setItem("guestMode", "false");
    
    return { success: true, user: user, error: null };
  } catch (error) {
    console.error("Register error:", error);
    
    // If Firestore operation failed but user was created, delete the orphaned user
    if (user && error.message === "USERNAME_TAKEN") {
      try {
        await user.delete();
      } catch (deleteError) {
        console.error("Failed to delete orphaned user:", deleteError);
      }
      return { success: false, error: "Username sudah digunakan", user: null };
    }
    
    // If any other Firestore error occurred after user creation, try to clean up
    if (user && error.code !== "auth/email-already-in-use") {
      try {
        await user.delete();
      } catch (deleteError) {
        console.error("Failed to delete orphaned user:", deleteError);
      }
    }
    
    return { success: false, error: getAuthErrorMessage(error.code) || error.message, user: null };
  }
}

// Sign in with email/password
async function signInWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    currentUser = userCredential.user;
    isGuestMode = false;
    localStorage.setItem("guestMode", "false");
    return { success: true, user: userCredential.user, error: null };
  } catch (error) {
    console.error("Sign in error:", error);
    return { success: false, error: getAuthErrorMessage(error.code), user: null };
  }
}

// Sign in with Google (updated to check for username)
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    currentUser = result.user;
    isGuestMode = false;
    localStorage.setItem("guestMode", "false");
    
    // Check if user has a username set up
    const profileResult = await getUserProfile(result.user.uid);
    
    if (profileResult.success && profileResult.profile?.username) {
      // User has username, normal login
      return { 
        success: true, 
        user: result.user, 
        needsUsername: false,
        profile: profileResult.profile
      };
    } else {
      // User needs to set up username
      return { 
        success: true, 
        user: result.user, 
        needsUsername: true,
        profile: null
      };
    }
  } catch (error) {
    console.error("Google sign-in error:", error);
    return { success: false, error: getAuthErrorMessage(error.code), needsUsername: false };
  }
}

// Save username for Google user (first-time setup)
async function saveUsernameForGoogleUser(userId, username) {
  // Validate username format
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return { success: false, error: usernameValidation.error };
  }
  
  try {
    const user = auth.currentUser;
    if (!user || user.uid !== userId) {
      return { success: false, error: "User tidak valid" };
    }
    
    const usernameLower = username.toLowerCase().trim();
    
    // Use transaction to atomically check and reserve username
    await runTransaction(db, async (transaction) => {
      // Check if username is already taken within transaction
      const usernameDoc = await transaction.get(doc(db, "usernames", usernameLower));
      
      if (usernameDoc.exists()) {
        throw new Error("USERNAME_TAKEN");
      }
      
      // Reserve username
      transaction.set(doc(db, "usernames", usernameLower), {
        userId: userId,
        createdAt: serverTimestamp()
      });
      
      // Save user profile
      transaction.set(doc(db, "users", userId, "profile", "info"), {
        username: usernameLower,
        displayUsername: username.trim(), // Preserve original case for display
        email: user.email,
        authProvider: "google",
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp()
      });
    });
    
    return { success: true, error: null };
  } catch (error) {
    console.error("Save username error:", error);
    
    if (error.message === "USERNAME_TAKEN") {
      return { success: false, error: "Username sudah digunakan" };
    }
    
    return { success: false, error: error.message };
  }
}

// Send password reset email
async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch (error) {
    console.error("Reset password error:", error);
    return { success: false, error: getAuthErrorMessage(error.code) };
  }
}

// Get Firebase auth error message in Indonesian
function getAuthErrorMessage(errorCode) {
  const errorMessages = {
    "auth/email-already-in-use": "Email sudah terdaftar",
    "auth/invalid-email": "Format email tidak valid",
    "auth/weak-password": "Password terlalu lemah (minimal 6 karakter)",
    "auth/user-not-found": "Email tidak terdaftar",
    "auth/wrong-password": "Password salah",
    "auth/invalid-credential": "Email atau password salah",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/user-disabled": "Akun telah dinonaktifkan",
    "auth/operation-not-allowed": "Metode login ini tidak diizinkan",
    "auth/popup-closed-by-user": "Login dibatalkan",
    "auth/popup-blocked": "Popup diblokir oleh browser",
    "auth/network-request-failed": "Koneksi jaringan gagal. Periksa internet Anda.",
    "auth/requires-recent-login": "Silakan login ulang untuk melanjutkan",
    "auth/missing-email": "Email wajib diisi",
    "auth/missing-password": "Password wajib diisi"
  };
  
  return errorMessages[errorCode] || "Terjadi kesalahan. Silakan coba lagi.";
}

// Continue as guest
function continueAsGuest() {
  currentUser = null;
  setGuestMode(true);
  return { success: true, isGuest: true };
}

// Sign out
async function logOut() {
  try {
    await signOut(auth);
    currentUser = null;
    isGuestMode = false;
    localStorage.removeItem("guestMode");
    localStorage.removeItem("guestRehabHistory");
    return { success: true };
  } catch (error) {
    console.error("Sign out error:", error);
    return { success: false, error: error.message };
  }
}

// Save rehab history to Firestore (for logged-in users)
async function saveRehabHistoryToFirestore(rehabData) {
  if (!currentUser) {
    console.warn("Cannot save to Firestore: User not logged in");
    return { success: false, error: "User not logged in" };
  }

  try {
    const docRef = await addDoc(collection(db, "users", currentUser.uid, "rehabHistory"), {
      namaLatihan: rehabData.namaLatihan,
      repetisi: rehabData.repetisi,
      totalLatihan: rehabData.totalLatihan,
      totalRepetisi: rehabData.totalRepetisi,
      durasi: rehabData.durasi,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      timestamp: serverTimestamp()
    });
    return { success: true, docId: docRef.id };
  } catch (error) {
    console.error("Error saving to Firestore:", error);
    return { success: false, error: error.message };
  }
}

// Save rehab history to localStorage (for guest users)
function saveRehabHistoryToLocalStorage(rehabData) {
  try {
    const existingHistory = JSON.parse(localStorage.getItem("guestRehabHistory") || "[]");
    existingHistory.push({
      namaLatihan: rehabData.namaLatihan,
      repetisi: rehabData.repetisi,
      totalLatihan: rehabData.totalLatihan,
      totalRepetisi: rehabData.totalRepetisi,
      durasi: rehabData.durasi,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem("guestRehabHistory", JSON.stringify(existingHistory));
    return { success: true };
  } catch (error) {
    console.error("Error saving to localStorage:", error);
    return { success: false, error: error.message };
  }
}

// Save rehab history (automatically chooses storage method)
async function saveRehabHistory(rehabData) {
  if (currentUser) {
    return await saveRehabHistoryToFirestore(rehabData);
  } else if (isGuestMode) {
    return saveRehabHistoryToLocalStorage(rehabData);
  }
  return { success: false, error: "Not authenticated" };
}

// Get rehab history from Firestore (for logged-in users)
async function getRehabHistoryFromFirestore() {
  if (!currentUser) {
    return { success: false, error: "User not logged in", data: [] };
  }

  try {
    const q = query(
      collection(db, "users", currentUser.uid, "rehabHistory"),
      orderBy("timestamp", "desc")
    );
    const querySnapshot = await getDocs(q);
    const history = [];
    querySnapshot.forEach((doc) => {
      history.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, data: history };
  } catch (error) {
    console.error("Error getting Firestore history:", error);
    return { success: false, error: error.message, data: [] };
  }
}

// Get rehab history from localStorage (for guest users)
function getRehabHistoryFromLocalStorage() {
  try {
    const history = JSON.parse(localStorage.getItem("guestRehabHistory") || "[]");
    return { success: true, data: history };
  } catch (error) {
    console.error("Error getting localStorage history:", error);
    return { success: false, error: error.message, data: [] };
  }
}

// Get rehab history (automatically chooses storage method)
async function getRehabHistory() {
  if (currentUser) {
    return await getRehabHistoryFromFirestore();
  } else if (isGuestMode) {
    return getRehabHistoryFromLocalStorage();
  }
  return { success: false, error: "Not authenticated", data: [] };
}

// Listen for auth state changes
function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      isGuestMode = false;
      localStorage.setItem("guestMode", "false");
    }
    callback({
      user,
      isGuest: isGuestMode,
      isAuthenticated: !!user || isGuestMode
    });
  });
}

// Initialize auth state on load
function initAuth() {
  isGuestMode = checkGuestMode();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      currentUser = user;
      unsubscribe();
      resolve({
        user,
        isGuest: isGuestMode,
        isAuthenticated: !!user || isGuestMode
      });
    });
  });
}

// Delete rehab history from Firestore
async function deleteRehabHistoryFromFirestore(docId) {
  if (!currentUser) {
    return { success: false, error: "User not logged in" };
  }

  try {
    const docRef = doc(db, "users", currentUser.uid, "rehabHistory", docId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error("Error deleting from Firestore:", error);
    return { success: false, error: error.message };
  }
}

// Get rehab history from Firestore with pagination
async function getRehabHistoryPaginated(limitCount = 10, lastDocSnapshot = null) {
  if (!currentUser) {
    return { success: false, error: "User not logged in", data: [], lastDoc: null, hasMore: false };
  }

  try {
    let q;
    if (lastDocSnapshot) {
      q = query(
        collection(db, "users", currentUser.uid, "rehabHistory"),
        orderBy("timestamp", "desc"),
        startAfter(lastDocSnapshot),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, "users", currentUser.uid, "rehabHistory"),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
    }

    const querySnapshot = await getDocs(q);
    const history = [];
    let lastDoc = null;

    querySnapshot.forEach((docSnap) => {
      history.push({ id: docSnap.id, ...docSnap.data() });
      lastDoc = docSnap;
    });

    return { 
      success: true, 
      data: history, 
      lastDoc: lastDoc,
      hasMore: history.length === limitCount
    };
  } catch (error) {
    console.error("Error getting paginated Firestore history:", error);
    return { success: false, error: error.message, data: [], lastDoc: null, hasMore: false };
  }
}

// Export functions
export {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  continueAsGuest,
  logOut,
  getCurrentAuthState,
  saveRehabHistory,
  getRehabHistory,
  onAuthChange,
  initAuth,
  checkGuestMode,
  deleteRehabHistoryFromFirestore,
  getRehabHistoryPaginated,
  validateUsername,
  checkUsernameAvailable,
  getUserProfile,
  saveUsernameForGoogleUser,
  resetPassword,
  getAuthErrorMessage
};
