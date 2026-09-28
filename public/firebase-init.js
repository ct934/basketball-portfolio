// ============================================================================
// firebase-init.js  —  REFERENCE VERSION for the scouting-log system
// ----------------------------------------------------------------------------
// If you already have a firebase-init.js, you only need to make sure it:
//   1) initializes the app with YOUR config,
//   2) starts Analytics, and
//   3) exports `db` (Firestore) and `auth` (Auth)
// Reconcile this with your existing file rather than blindly overwriting.
//
// Uses the Firebase v10 modular SDK over CDN (matches your <script type="module">).
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔧 REPLACE with your project's config (Firebase console → Project settings → Your apps).
const firebaseConfig = {
  apiKey: "AIzaSyC9tKKpmDLwRZ1FIiiF9q66u0zU0CVYJyk",
  authDomain: "basketball-portfolio-7c1eb.firebaseapp.com",
  projectId: "basketball-portfolio-7c1eb",
  storageBucket: "basketball-portfolio-7c1eb.firebasestorage.app",
  messagingSenderId: "658084234792",
  appId: "1:658084234792:web:312046b7260e7e5cb5971d",
  measurementId: "G-ZWV236J8RB"
};

const app = initializeApp(firebaseConfig);
export const analyticsReady = isSupported()
  .then((supported) => supported ? getAnalytics(app) : null)
  .catch((error) => {
    console.warn("[analytics] Firebase Analytics could not start:", error);
    return null;
  });
export const db = getFirestore(app);
export const auth = getAuth(app);
