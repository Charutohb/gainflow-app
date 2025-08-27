import React, { useState } from 'react';

// Um ícone simples para o logo, feito com SVG para não precisar de imagens
const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
    </svg>
);

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();
        setIsLoading(true);
        console.log("Tentando login com:", { email, password });
        
        // TODO: Adicionar a lógica de autenticação com o Firebase aqui.
        
        // Simulação de uma chamada de API
        setTimeout(() => {
            setIsLoading(false);
            alert("Lógica de login com Firebase a ser implementada!");
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4 font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <LogoIcon />
                    <h1 className="mt-4 text-3xl font-bold text-gray-800">
                        <span className="text-green-500">Gain</span>Flow
                    </h1>
                    <p className="text-gray-500 mt-1">Acesse sua conta</p>
                </div>

                <div className="bg-white p-8 rounded-lg shadow-md">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Senha
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500"
                            />
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
                            >
                                {isLoading ? 'Entrando...' : 'Entrar'}
                            </button>
                        </div>
                    </form>
                    <div className="text-center mt-4">
                        <a href="#" className="text-sm text-green-600 hover:text-green-500">
                            Esqueceu sua senha?
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}