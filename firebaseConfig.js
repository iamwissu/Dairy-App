// ============================================================================
// FIREBASE CONFIGURATION
// ----------------------------------------------------------------------------
// 1. Go to https://console.firebase.google.com → create (or open) a project.
// 2. Project settings → General → "Your apps" → Add app → Web ( </> ).
// 3. Copy the firebaseConfig object it gives you and paste the values below.
// 4. In the console, enable:
//      Build > Authentication > Sign-in method > Email/Password
//      Build > Firestore Database > Create database (start in production mode)
// 5. Paste the security rules from firestore.rules into
//      Firestore Database > Rules, then Publish.
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBJvyQUePNMXv-qgc6dnkzm6ivQCWj2Gmw",
  authDomain: "kioku-app-e76c5.firebaseapp.com",
  projectId: "kioku-app-e76c5",
  storageBucket: "kioku-app-e76c5.firebasestorage.app",
  messagingSenderId: "820365202540",
  appId: "1:820365202540:web:b333e7eda3e2d597567449",
};

// Note: it's normal/expected for this config to be public in a client-side
// app like this one — it is not a secret. What actually protects your data
// is the Firestore Security Rules (see firestore.rules), which is why that
// file matters just as much as this one.
