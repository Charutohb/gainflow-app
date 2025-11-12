// Caminho: ./firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

//
// IMPORTANTE: Cole as suas chaves reais do Firebase aqui
// (Você encontra isso no Console do Firebase > Configurações do Projeto > [Seu App Web])
//
const firebaseConfig = {
  apiKey: "AIzaSyAZUFTX7Bb9_6PS-QIvbcUNkp60aErgrK8",
  authDomain: "gainflow-app.firebaseapp.com",
  projectId: "gainflow-app",
  storageBucket: "gainflow-app.appspot.com",
  messagingSenderId: "875904649553",
  appId: "1:875904649553:web:a6f91e0a376325a1aeeb70",
  measurementId: "G-NH6R215HBG"
};

//
// Inicializa e exporta todos os serviços
//
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); // Garante que a autenticação seja exportada
export const functions = getFunctions(app, 'us-central1'); // Define a região e exporta