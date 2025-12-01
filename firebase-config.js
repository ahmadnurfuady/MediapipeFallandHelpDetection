// Firebase Configuration and Authentication Module
// For MediaPipe Fall and Help Detection System

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut 
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
  limit,
  startAfter 
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

// Sign in with Google
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    currentUser = result.user;
    isGuestMode = false;
    localStorage.setItem("guestMode", "false");
    return { success: true, user: result.user };
  } catch (error) {
    console.error("Google sign-in error:", error);
    return { success: false, error: error.message };
  }
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
  continueAsGuest,
  logOut,
  getCurrentAuthState,
  saveRehabHistory,
  getRehabHistory,
  onAuthChange,
  initAuth,
  checkGuestMode,
  deleteRehabHistoryFromFirestore,
  getRehabHistoryPaginated
};
