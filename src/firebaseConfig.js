import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Sua configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAZUFTX7Bb9_6PS-QIvbcUNkp60aErgrK8",
  authDomain: "gainflow-app.firebaseapp.com",
  projectId: "gainflow-app",
  storageBucket: "gainflow-app.appspot.com",
  messagingSenderId: "875904649553",
  appId: "1:875904649553:web:a6f91e0a376325a1aeeb70",
  measurementId: "G-NH6R215HBG"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que vamos usar na aplicação
export const auth = getAuth(app);
export const db = getFirestore(app);