// ============================================================================
// AUTH MODULE
// Wraps Firebase Authentication: email/password signup, login, signout,
// and the auth-state listener that drives which view the app shows.
// ============================================================================
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

/**
 * Creates a new account with email + password.
 * @returns {Promise<import("firebase/auth").UserCredential>}
 */
export function signUp(auth, email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Logs in an existing account with email + password.
 */
export function logIn(auth, email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Signs the current user out.
 */
export function logOut(auth) {
  return signOut(auth);
}

/**
 * Subscribes to auth state changes. Calls onUser(user|null) whenever it changes.
 * Returns the unsubscribe function.
 */
export function watchAuthState(auth, onUser) {
  return onAuthStateChanged(auth, onUser);
}

/**
 * Turns a Firebase Auth error code into a short, friendly message
 * so the UI never has to show raw "auth/xyz" strings to a user.
 */
export function friendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists for that email — try logging in instead.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
