import React, { useState, useEffect } from 'react';
import { db, auth } from './firebaseConfig';
import { doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
    </svg>
);

export default function FinalizeSignupScreen({ inviteId }) {
    const [nome, setNome] = useState('');
    const [senha, setSenha] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [inviteInfo, setInviteInfo] = useState(null);
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        const validateInvite = async () => {
            if (inviteId) {
                const inviteDocRef = doc(db, "convites", inviteId);
                const inviteDocSnap = await getDoc(inviteDocRef);

                if (inviteDocSnap.exists()) {
                    setInviteInfo(inviteDocSnap.data());
                } else {
                    setError("Link de convite inválido ou já utilizado.");
                }
            } else {
                setError("Link de convite inválido ou ausente.");
            }
            setIsValidating(false);
        };
        validateInvite();
    }, [inviteId]);

    const handleFinalize = async (e) => {
        e.preventDefault();
        if (senha.length < 6) {
            setError("A senha precisa ter no mínimo 6 caracteres.");
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            // 1. Cria o usuário no Firebase Authentication (para login)
            const userCredential = await createUserWithEmailAndPassword(auth, inviteInfo.email, senha);
            const newUser = userCredential.user;

            // 2. Salva os dados do novo usuário na coleção "users" do Firestore
            const userDocRef = doc(db, "users", newUser.uid);
            await setDoc(userDocRef, {
                nome: nome,
                email: inviteInfo.email,
                perfil: 'agente',
                idFranquia: inviteInfo.idFranquia,
                status: 'Ativo',
                level: 'Junior' // Adicionado um nível padrão
            });

            // 3. Remove o convite da coleção "convites" para invalidar o link
            const inviteDocRef = doc(db, "convites", inviteId);
            await deleteDoc(inviteDocRef);

            alert("Cadastro finalizado com sucesso! Você já pode fazer o login.");
            window.location.href = '/'; // Redireciona para a página de login

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                setError("Este email já está cadastrado. Tente fazer o login.");
            } else {
                setError("Ocorreu um erro ao finalizar o cadastro.");
            }
            console.error("Erro ao finalizar cadastro:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isValidating) {
        return <div className="min-h-screen flex items-center justify-center"><p>Verificando convite...</p></div>;
    }

    if (error && !inviteInfo) {
        return <div className="min-h-screen flex items-center justify-center"><p className="text-red-500">{error}</p></div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4 font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <LogoIcon />
                    <h1 className="mt-4 text-3xl font-bold text-gray-800"><span className="text-green-500">Gain</span>Flow</h1>
                    <p className="text-gray-500 mt-1">Finalize o seu cadastro</p>
                </div>
                <div className="bg-white p-8 rounded-lg shadow-md">
                    <form onSubmit={handleFinalize} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-500">Email de Convite</label>
                            <p className="font-semibold text-gray-800 mt-1">{inviteInfo?.email}</p>
                        </div>
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome Completo</label>
                            <input id="name" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Crie uma Senha</label>
                            <input id="password" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                        </div>
                        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                        <div>
                            <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                                {isLoading ? 'Finalizando...' : 'Concluir Cadastro'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}