import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from './firebaseConfig';

import LoginScreen from './LoginScreen';
import FranchiseeDashboard from './FranchiseeDashboard';
import AgentDashboard from './AgentDashboard';
import FinalizeSignupScreen from './FinalizeSignupScreen';

function App() {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('conviteId');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // CORREÇÃO APLICADA AQUI: "usuarios" -> "users"
                const userDocRef = doc(db, "users", currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    setUser(currentUser);
                    setUserProfile(userDocSnap.data());
                } else {
                    console.error("Perfil do usuário não encontrado na coleção 'users' do Firestore! A fazer logout.");
                    signOut(auth);
                }
            } else {
                setUser(null);
                setUserProfile(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = () => {
        signOut(auth).catch((error) => console.error("Erro ao fazer logout:", error));
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p className="text-xl font-semibold text-gray-700">Carregando GainFlow...</p>
            </div>
        );
    }

    if (inviteId) {
        return <FinalizeSignupScreen inviteId={inviteId} />;
    }

    if (user && userProfile) {
        if (userProfile.perfil === 'franqueado') {
            return <FranchiseeDashboard user={user} userProfile={userProfile} handleLogout={handleLogout} />;
        } else if (userProfile.perfil === 'agente') {
            return <AgentDashboard user={user} userProfile={userProfile} handleLogout={handleLogout} />;
        }
    }
    
    return <LoginScreen />;
}

export default App;