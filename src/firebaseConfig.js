// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZUFTX7Bb9_6PS-QIvbcUNkp60aErgrK8",
  authDomain: "gainflow-app.firebaseapp.com",
  projectId: "gainflow-app",
  storageBucket: "gainflow-app.firebasestorage.app",
  messagingSenderId: "875904649553",
  appId: "1:875904649553:web:a6f91e0a376325a1aeeb70",
  measurementId: "G-NH6R215HBG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);