import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { CurrencyInput } from './CurrencyInput';

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-600"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

const getCurrentMonth = () => {
    const now = new Date();
    now.setFullYear(2025, 8); // Simula Setembro de 2025
    return now.toISOString().slice(0, 7);
};

const getPreviousMonth = () => {
    const date = new Date();
    date.setFullYear(2025, 8); // Simula Setembro de 2025
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7);
};

export default function AgentDashboard({ user, userProfile, handleLogout }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    const [agentPlan, setAgentPlan] = useState(null);
    const [franchiseData, setFranchiseData] = useState(null);
    const [m0Clients, setM0Clients] = useState([]);
    const [m1Clients, setM1Clients] = useState([]);
    const [newClientName, setNewClientName] = useState('');
    const [newClientAgreedTPV, setNewClientAgreedTPV] = useState(0);
    const [performance, setPerformance] = useState({ novosAtivos: 0, tpvM1: 0, migracao: 0 });
    const [calculatedRV, setCalculatedRV] = useState({ total: 0, kpis: {} });

    useEffect(() => {
        if (!user || !userProfile || !userProfile.idFranquia) return;
        setIsLoading(true);
        const franchiseId = userProfile.idFranquia;
        const agentId = user.uid;
        const currentMonth = getCurrentMonth();
        const previousMonth = getPreviousMonth();

        const fetchInitialData = async () => {
            try {
                const franchiseDocRef = doc(db, "franquias", franchiseId);
                const franchiseSnap = await getDoc(franchiseDocRef);
                if (franchiseSnap.exists()) setFranchiseData(franchiseSnap.data());

                const planDocRef = doc(db, "franquias", franchiseId, "planos", currentMonth);
                const planSnap = await getDoc(planDocRef);
                if (planSnap.exists()) {
                    const allAgentPlans = planSnap.data().agents || [];
                    const agentSpecificPlan = allAgentPlans.find(a => a.id === agentId);
                    if(agentSpecificPlan) setAgentPlan({ ...userProfile, ...agentSpecificPlan });
                }
            } catch (error) {
                console.error("Erro ao buscar dados iniciais:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();

        const m0Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", currentMonth));
        const unsubscribeM0 = onSnapshot(m0Query, (querySnapshot) => {
            const clients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setM0Clients(clients);
        });

        const m1Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", previousMonth), where("status", "==", "active"));
        const unsubscribeM1 = onSnapshot(m1Query, (querySnapshot) => {
            const clients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setM1Clients(clients);
        });

        return () => {
            unsubscribeM0();
            unsubscribeM1();
        };
    }, [user, userProfile]);

    useEffect(() => {
        if (!franchiseData || !franchiseData.regrasRV) return;
        
        const totalNovosAtivos = m0Clients.filter(client => client.status === 'active').length;
        const totalTpvM1 = m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0);
        const migrationTriggerPercent = franchiseData.regrasRV.triggers.migracao || 70;
        
        const totalMigracao = m1Clients.filter(client => {
            if (!client.agreedTPV || client.agreedTPV === 0) return false;
            const migrationPercent = ((client.currentTPV || 0) / client.agreedTPV) * 100;
            return migrationPercent >= migrationTriggerPercent;
        }).length;

        setPerformance({ novosAtivos: totalNovosAtivos, tpvM1: totalTpvM1, migracao: totalMigracao });
    }, [m0Clients, m1Clients, franchiseData]);

    useEffect(() => {
        if (!agentPlan || !franchiseData || !franchiseData.kpis) return;
        const { rvReference, goals } = agentPlan;
        const { kpis, regrasRV } = franchiseData;
        const { weights, triggers, caps } = regrasRV;
        const newCalculatedRV = { total: 0, kpis: {} };
        kpis.forEach(kpi => {
            const kpiId = kpi.id;
            const goal = goals[kpiId] || 0;
            const achieved = performance[kpiId] || 0;
            let achievedPercent = goal > 0 ? (achieved / goal) * 100 : 0;
            let finalPercent = 0;
            let isTriggered = false;
            if (kpiId === 'migracao') {
                const triggerValue = goal * (triggers[kpiId] / 100);
                if (achieved >= triggerValue) isTriggered = true;
            } else {
                if (achievedPercent >= triggers[kpiId]) isTriggered = true;
            }
            if (isTriggered) finalPercent = Math.min(achievedPercent, caps[kpiId]);
            const rvValue = (rvReference * (weights[kpiId] / 100)) * (finalPercent / 100);
            newCalculatedRV.kpis[kpiId] = { value: rvValue, percent: achievedPercent.toFixed(2) };
            newCalculatedRV.total += rvValue;
        });
        setCalculatedRV(newCalculatedRV);
    }, [performance, agentPlan, franchiseData]);

    const handleAddM0Client = async (e) => {
        e.preventDefault();
        if (!newClientName || !newClientAgreedTPV) {
            alert("Preencha o nome e o TPV acordado.");
            return;
        }
        try {
            await addDoc(collection(db, "clientes"), {
                agentId: user.uid,
                franchiseId: userProfile.idFranquia,
                name: newClientName,
                agreedTPV: Number(newClientAgreedTPV),
                status: 'pending',
                monthAdded: getCurrentMonth(),
                createdAt: serverTimestamp(),
                currentTPV: 0,
            });
            setNewClientName('');
            setNewClientAgreedTPV(0);
        } catch (error) {
            console.error("Erro ao credenciar cliente: ", error);
            alert("Não foi possível credenciar o cliente.");
        }
    };

    const handleToggleActivation = async (clientId, currentStatus) => {
        const clientDocRef = doc(db, "clientes", clientId);
        const newStatus = currentStatus === 'active' ? 'pending' : 'active';
        try {
            await updateDoc(clientDocRef, { status: newStatus });
        } catch (error) {
            console.error("Erro ao ativar cliente: ", error);
        }
    };

    const handleM1TpvChange = async (clientId, value) => {
        const clientDocRef = doc(db, "clientes", clientId);
        try {
            await updateDoc(clientDocRef, { currentTPV: Number(value) });
        } catch (error) {
            console.error("Erro ao atualizar TPV: ", error);
        }
    };

    const handleDeleteClient = async (clientId) => {
        if (window.confirm("Tem a certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.")) {
            try {
                const clientDocRef = doc(db, "clientes", clientId);
                await deleteDoc(clientDocRef);
            } catch (error) {
                console.error("Erro ao excluir cliente: ", error);
                alert("Não foi possível excluir o cliente.");
            }
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center p-8">Carregando dados do agente...</div>;
        if (!agentPlan || !franchiseData) return <div className="text-center p-8 text-red-600">Não foi possível carregar os dados do plano ou da franquia. Contacte o seu franqueado.</div>;
        
        switch (activeTab) {
            case 'dashboard':
                return (
                    <div className="space-y-8">
                        <div className="bg-green-600 text-white p-6 rounded-lg shadow-lg text-center">
                            <h2 className="text-lg font-semibold text-green-200">Sua RV Estimada este Mês</h2>
                            <p className="text-5xl font-bold mt-2">{calculatedRV.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Detalhamento da RV</h3>
                            <div className="space-y-4">
                                {franchiseData.kpis.map(kpi => (
                                    <div key={kpi.id}>
                                        <div className="flex justify-between font-medium"><p>{kpi.name} ({franchiseData.regrasRV.weights[kpi.id]}%)</p><p>{(calculatedRV.kpis[kpi.id]?.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                        <p className="text-sm text-gray-500">Atingimento: {calculatedRV.kpis[kpi.id]?.percent || 0}%</p>
                                        <p className="text-sm text-gray-500">Meta: {agentPlan.goals[kpi.id] || 0} | Realizado: {performance[kpi.id] || 0}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'm0_clients':
                return (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Adicionar Novo Cliente (M0)</h3>
                            <form onSubmit={handleAddM0Client} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="md:col-span-1"><label className="block text-sm font-medium text-gray-700">Nome do Cliente</label><input type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md"/></div>
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700">TPV Acordado (R$)</label>
                                    <CurrencyInput value={newClientAgreedTPV} onChange={setNewClientAgreedTPV} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="R$ 0,00"/>
                                </div>
                                <button type="submit" className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 h-10">Credenciar Cliente</button>
                            </form>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Atual (M0)</h3>
                            <ul className="divide-y divide-gray-200">
                                {m0Clients.map(client => (
                                    <li key={client.id} className="py-4 flex items-center justify-between">
                                        <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {(client.agreedTPV || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                        <div className="flex items-center space-x-4">
                                            <div className="flex items-center">
                                                <label htmlFor={`ativado-${client.id}`} className="mr-2 text-sm font-medium text-gray-700">Ativado:</label>
                                                <input id={`ativado-${client.id}`} type="checkbox" checked={client.status === 'active'} onChange={() => handleToggleActivation(client.id, client.status)} className="h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500"/>
                                            </div>
                                            <button onClick={() => handleDeleteClient(client.id)} title="Excluir Cliente"><TrashIcon /></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                );
            case 'm1_clients':
                return (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Anterior (M1)</h3>
                        <div className="space-y-6">
                            {m1Clients.map(client => {
                                const migrationPercent = client.agreedTPV > 0 ? ((client.currentTPV || 0) / client.agreedTPV) * 100 : 0;
                                const hasMigrated = migrationPercent >= (franchiseData.regrasRV.triggers.migracao || 70);
                                return (
                                    <div key={client.id} className="border-b pb-4">
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {(client.agreedTPV || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                            <div className="w-1/3">
                                                <label className="block text-sm font-medium text-gray-700">TPV Transacionado (R$)</label>
                                                <CurrencyInput
                                                    value={client.currentTPV || 0}
                                                    onChange={(newValue) => {
                                                        setM1Clients(clients => clients.map(c => c.id === client.id ? {...c, currentTPV: newValue} : c));
                                                    }}
                                                    onBlur={() => handleM1TpvChange(client.id, client.currentTPV)}
                                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                                                    placeholder="R$ 0,00"
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1"><span className="text-sm font-medium text-gray-700">Progresso de Migração</span><span className={`text-sm font-bold ${hasMigrated ? 'text-green-600' : 'text-gray-600'}`}>{migrationPercent.toFixed(1)}%</span></div>
                                            <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${hasMigrated ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(migrationPercent, 100)}%` }}></div></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <header className="bg-white shadow-sm">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800"><span className="text-green-500">Gain</span>Flow</h1>
                        <p className="font-bold text-gray-800">{agentPlan?.name || userProfile.nome}</p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-500 hover:text-red-600">
                        <LogoutIcon />
                        <span className="hidden sm:inline">Sair</span>
                    </button>
                </div>
            </header>
            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8 overflow-x-auto">
                    <button onClick={() => setActiveTab('dashboard')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'dashboard' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Dashboard RV</button>
                    <button onClick={() => setActiveTab('m0_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm0_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M0 (Mês Atual)</button>
                    <button onClick={() => setActiveTab('m1_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm1_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M1 (Mês Anterior)</button>
                </nav>
            </div>
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                {renderContent()}
            </main>
        </div>
    );
}
