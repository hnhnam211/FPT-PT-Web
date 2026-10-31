import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDBdCyamurj6ySot6CyLiTAxDDtE1skeyo",
  authDomain: "fpt-pt-website.firebaseapp.com",
  projectId: "fpt-pt-website",
  storageBucket: "fpt-pt-website.firebasestorage.app",
  messagingSenderId: "1091761552106",
  appId: "1:1091761552106:web:47e81e2ee46f8e61c53593",
  measurementId: "G-N1Y76G01B1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);