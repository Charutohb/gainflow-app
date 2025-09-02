import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { CurrencyInput } from './CurrencyInput';

// Componente do Ícone de Logout
const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

// Componente do Ícone de Lixeira
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-600"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

// Funções de Data
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);
const getPreviousMonth = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7);
};

export default function AgentDashboard({ user, userProfile, handleLogout }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    const [agentPlan, setAgentPlan] = useState(null);
    const [franchiseData, setFranchiseData] = useState(null);
    
    // Estados que guardam os dados brutos vindos do Firestore
    const [m0ClientsForDisplay, setM0ClientsForDisplay] = useState([]);
    const [m0ClientsForKpi, setM0ClientsForKpi] = useState([]);
    const [m1Clients, setM1Clients] = useState([]);
    
    // Estados para o formulário de novo cliente
    const [newClientName, setNewClientName] = useState('');
    const [newClientAgreedTPV, setNewClientAgreedTPV] = useState(0);
    
    // Um único estado para todos os dados já calculados da RV
    const [rvData, setRvData] = useState({ total: 0, kpis: {} });
    
    const debounceTimeout = useRef(null);

    // useEffect principal para buscar todos os dados do Firestore
    useEffect(() => {
        if (!user || !userProfile || !userProfile.idFranquia) return;
        const franchiseId = userProfile.idFranquia;
        const agentId = user.uid;
        const currentMonth = getCurrentMonth();
        const previousMonth = getPreviousMonth();

        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const franchiseDocRef = doc(db, "franquias", franchiseId);
                const franchiseSnap = await getDoc(franchiseDocRef);
                setFranchiseData(franchiseSnap.exists() ? franchiseSnap.data() : null);

                const planDocRef = doc(db, "franquias", franchiseId, "planos", currentMonth);
                const planSnap = await getDoc(planDocRef);
                if (planSnap.exists()) {
                    const allAgentPlans = planSnap.data().agents || [];
                    const agentSpecificPlan = allAgentPlans.find(a => a.id === agentId);
                    if (agentSpecificPlan) {
                        setAgentPlan({ ...userProfile, ...agentSpecificPlan });
                    }
                }
            } catch (error) {
                console.error("Erro ao buscar dados iniciais:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();

        const m0DisplayQuery = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", currentMonth));
        const unsubscribeM0Display = onSnapshot(m0DisplayQuery, (snapshot) => setM0ClientsForDisplay(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        const m1Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", previousMonth), where("status", "==", "active"));
        const unsubscribeM1 = onSnapshot(m1Query, (snapshot) => setM1Clients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        const m0KpiQuery = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthActivated", "==", currentMonth));
        const unsubscribeM0Kpi = onSnapshot(m0KpiQuery, (snapshot) => setM0ClientsForKpi(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        return () => {
            unsubscribeM0Display();
            unsubscribeM1();
            unsubscribeM0Kpi();
        };
    }, [user, userProfile]);

    // useEffect secundário, dedicado apenas a recalcular a RV quando os dados brutos mudam
    useEffect(() => {
        if (!agentPlan || !franchiseData || !franchiseData.kpis) {
            return;
        }

        const performance = {
            novosAtivos: m0ClientsForKpi.length,
            tpvM1: m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0),
            migracao: m1Clients.filter(client => {
                if (!client.agreedTPV || client.agreedTPV === 0) return false;
                const migrationPercent = ((client.currentTPV || 0) / client.agreedTPV) * 100;
                return migrationPercent >= (franchiseData.regrasRV.triggers.migracao || 70);
            }).length
        };

        const { rvReference, goals, caps } = agentPlan;
        const { kpis, regrasRV } = franchiseData;
        const { weights, triggers } = regrasRV;
        const newRvData = { total: 0, kpis: {} };

        kpis.forEach(kpi => {
            const kpiId = kpi.id;

            // ✅ **LÓGICA ANTI-NAN**: Pega os valores do plano ou assume 0 se não existirem.
            const goal = goals?.[kpiId] || 0;
            const weight = weights?.[kpiId] || 0;
            const trigger = triggers?.[kpiId] || 0;
            const cap = caps?.[kpiId] || 100; // Cap padrão de 100% se não definido
            const ref = rvReference || 0;

            const achieved = performance[kpiId];
            if (achieved === undefined) return;

            let achievedPercent = goal > 0 ? (achieved / goal) * 100 : 0;
            let finalPercent = 0;
            let isTriggered = false;

            // Lógica de gatilho (trigger)
            if (kpiId === 'migracao') {
                const triggerValue = goal * (trigger / 100);
                if (achieved >= triggerValue) isTriggered = true;
            } else {
                if (achievedPercent >= trigger) isTriggered = true;
            }
            
            // A RV só é calculada se o gatilho (trigger) for atingido
            if (isTriggered) {
                finalPercent = Math.min(achievedPercent, cap);
            }
            
            const rvValue = (ref * (weight / 100)) * (finalPercent / 100);
            
            newRvData.kpis[kpiId] = { 
                value: isNaN(rvValue) ? 0 : rvValue, // Garante que nunca será NaN
                percent: isNaN(achievedPercent) ? "0.00" : achievedPercent.toFixed(2),
                realizado: achieved
            };
            newRvData.total += isNaN(rvValue) ? 0 : rvValue;
        });

        setRvData(newRvData);

    }, [m0ClientsForKpi, m1Clients, agentPlan, franchiseData]);

    const handleAddM0Client = async (e) => {
        e.preventDefault();
        if (!newClientName || !newClientAgreedTPV) { return alert("Preencha o nome e o TPV acordado."); }
        try {
            await addDoc(collection(db, "clientes"), {
                agentId: user.uid, franchiseId: userProfile.idFranquia, name: newClientName,
                agreedTPV: Number(newClientAgreedTPV), status: 'pending', monthAdded: getCurrentMonth(),
                createdAt: serverTimestamp(), currentTPV: 0, monthActivated: null,
            });
            setNewClientName(''); setNewClientAgreedTPV(0);
        } catch (error) { console.error("Erro ao credenciar cliente: ", error); }
    };

    const handleToggleActivation = async (clientId, currentStatus) => {
        const clientDocRef = doc(db, "clientes", clientId);
        const newStatus = currentStatus === 'active' ? 'pending' : 'active';
        const newMonthActivated = newStatus === 'active' ? getCurrentMonth() : null;
        try { await updateDoc(clientDocRef, { status: newStatus, monthActivated: newMonthActivated }); }
        catch (error) { console.error("Erro ao ativar/desativar cliente: ", error); }
    };

    const handleM1TpvChange = (clientId, value) => {
        setM1Clients(clients => clients.map(c => (c.id === clientId ? { ...c, currentTPV: value } : c)));
        if (debounceTimeout.current) { clearTimeout(debounceTimeout.current); }
        debounceTimeout.current = setTimeout(async () => {
            const clientDocRef = doc(db, "clientes", clientId);
            try { await updateDoc(clientDocRef, { currentTPV: Number(value) }); }
            catch (error) { console.error("Erro ao atualizar TPV: ", error); }
        }, 800);
    };

    const handleDeleteClient = async (clientId) => {
        if (window.confirm("Tem a certeza que deseja excluir este cliente?")) {
            try { await deleteDoc(doc(db, "clientes", clientId)); }
            catch (error) { console.error("Erro ao excluir cliente: ", error); }
        }
    };
    
    const renderContent = () => {
        if (isLoading) { return <div className="text-center p-8">Carregando dados do agente...</div>; }
        if (!agentPlan || !franchiseData) { return <div className="text-center p-8 text-red-600">Não foi possível carregar os dados. Contacte o seu franqueado.</div>; }
        
        switch (activeTab) {
            case 'dashboard':
                return (
                    <div className="space-y-8">
                        <div className="bg-green-600 text-white p-6 rounded-lg shadow-lg text-center">
                            <h2 className="text-lg font-semibold text-green-200">Sua RV Estimada este Mês</h2>
                            <p className="text-5xl font-bold mt-2">{rvData.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Detalhamento da RV</h3>
                            <div className="space-y-4">
                                {franchiseData.kpis.map(kpi => {
                                    const kpiData = rvData.kpis[kpi.id] || { value: 0, percent: 0, realizado: 0 };
                                    return (
                                        <div key={kpi.id}>
                                            <div className="flex justify-between font-medium">
                                                <p>{kpi.name}</p>
                                                <p>{kpiData.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                            </div>
                                            <p className="text-sm text-gray-500">Atingimento: {kpiData.percent}%</p>
                                            <p className="text-sm text-gray-500">Meta: {agentPlan.goals?.[kpi.id] || 0} | Realizado: {kpiData.realizado}</p>
                                        </div>
                                    );
                                })}
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
                                <div className="md:col-span-1"><label className="block text-sm font-medium text-gray-700">TPV Acordado (R$)</label><CurrencyInput value={newClientAgreedTPV} onChange={setNewClientAgreedTPV} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="R$ 0,00"/></div>
                                <button type="submit" className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 h-10">Credenciar Cliente</button>
                            </form>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Atual (M0)</h3>
                            <ul className="divide-y divide-gray-200">
                                {m0ClientsForDisplay.map(client => {
                                    const registrationDate = client.createdAt?.toDate ? new Date(client.createdAt.toDate()).toLocaleDateString('pt-BR') : 'Data não disponível';
                                    return (
                                        <li key={client.id} className="py-4 flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">{client.name}</p>
                                                <p className="text-sm text-gray-500">TPV Acordado: {(client.agreedTPV || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                                <p className="text-sm text-gray-500">Cadastrado em: {registrationDate}</p>
                                            </div>
                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center">
                                                    <label htmlFor={`ativado-${client.id}`} className="mr-2 text-sm font-medium text-gray-700">Ativado:</label>
                                                    <input id={`ativado-${client.id}`} type="checkbox" checked={client.status === 'active'} onChange={() => handleToggleActivation(client.id, client.status)} className="h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500"/>
                                                </div>
                                                <button onClick={() => handleDeleteClient(client.id)} title="Excluir Cliente"><TrashIcon /></button>
                                            </div>
                                        </li>
                                    );
                                })}
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
                                            <div className="w-1/3"><label className="block text-sm font-medium text-gray-700">TPV Transacionado (R$)</label><CurrencyInput value={client.currentTPV || 0} onChange={(newValue) => handleM1TpvChange(client.id, newValue)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="R$ 0,00"/></div>
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
                    <div><h1 className="text-2xl font-bold text-gray-800"><span className="text-green-500">Gain</span>Flow</h1><p className="font-bold text-gray-800">{agentPlan?.name || userProfile.nome}</p></div>
                    <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-500 hover:text-red-600"><LogoutIcon /><span className="hidden sm:inline">Sair</span></button>
                </div>
            </header>
            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8 overflow-x-auto">
                    <button onClick={() => setActiveTab('dashboard')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'dashboard' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Dashboard RV</button>
                    <button onClick={() => setActiveTab('m0_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm0_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M0 (Mês Atual)</button>
                    <button onClick={() => setActiveTab('m1_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm1_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M1 (Mês Anterior)</button>
                </nav>
            </div>
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">{renderContent()}</main>
        </div>
    );
}