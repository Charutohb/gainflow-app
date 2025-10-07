import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CurrencyInput } from './CurrencyInput';

// Ícones
const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-600"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

// Funções de data
const getCurrentMonth = () => {
    const now = new Date();
    // PARA TESTE: Se precisar forçar um mês, descomente e ajuste a linha abaixo.
    // O número do mês é baseado em zero (0 = Janeiro, 9 = Outubro).
    // now.setFullYear(2025, 9); 
    return now.toISOString().slice(0, 7);
};

const getPreviousMonth = () => {
    const date = new Date();
    // PARA TESTE: Se precisar forçar um mês, descomente e ajuste a linha abaixo.
    // date.setFullYear(2025, 9);
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
    const [performance, setPerformance] = useState({});
    const [calculatedRV, setCalculatedRV] = useState({ total: 0, kpis: {} });

    useEffect(() => {
        if (!user || !userProfile || !userProfile.idFranquia) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const franchiseId = userProfile.idFranquia;
        const agentId = user.uid;
        const currentMonth = getCurrentMonth();
        const previousMonth = getPreviousMonth();

        const planDocRef = doc(db, "franquias", franchiseId, "planos", currentMonth);
        const unsubscribePlan = onSnapshot(planDocRef, (planSnap) => {
            if (planSnap.exists()) {
                const allAgentPlans = planSnap.data().agents || [];
                const agentSpecificPlan = allAgentPlans.find(a => a.id === agentId);
                if (agentSpecificPlan) {
                    setAgentPlan({ ...userProfile, ...agentSpecificPlan });
                } else {
                    setAgentPlan(userProfile);
                }
            } else {
                 setAgentPlan(userProfile);
            }
        });

        const fetchInitialData = async () => {
            try {
                const franchiseDocRef = doc(db, "franquias", franchiseId);
                const franchiseSnap = await getDoc(franchiseDocRef);
                if (franchiseSnap.exists()) {
                    setFranchiseData(franchiseSnap.data());
                }
            } catch (error) {
                console.error("Erro ao buscar dados da franquia:", error);
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
            unsubscribePlan();
            unsubscribeM0();
            unsubscribeM1();
        };
    }, [user, userProfile]);
    
    // --- LÓGICA DE CÁLCULO UNIFICADA E CORRIGIDA ---
    useEffect(() => {
        if (!agentPlan || !franchiseData || !franchiseData.kpis || !franchiseData.regrasRV) {
            return;
        }

        const { kpis } = franchiseData;

        // 1. CALCULAR MÉTRICAS BASE
        const totalNovosAtivos = m0Clients.filter(client => client.status === 'active').length;
        const totalTpvTransacionado = m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0);
        const totalTpvAcordado = m1Clients.reduce((sum, client) => sum + (client.agreedTPV || 0), 0);
        const migracaoPercent = totalTpvAcordado > 0 ? (totalTpvTransacionado / totalTpvAcordado) * 100 : 0;

        // 2. CRIAR OBJETO DE PERFORMANCE USANDO OS IDs CORRETOS DO BANCO
        const newPerformance = {};
        kpis.forEach(kpi => {
            // Esta lógica identifica o KPI pelo nome e atribui o valor ao seu ID correto
            if (kpi.name.toLowerCase().includes('novos ativos')) {
                newPerformance[kpi.id] = totalNovosAtivos;
            } else if (kpi.name.toLowerCase().includes('tpv transacionado')) {
                newPerformance[kpi.id] = totalTpvTransacionado;
            } else if (kpi.name.toLowerCase().includes('migração')) {
                newPerformance[kpi.id] = migracaoPercent;
            }
        });
        setPerformance(newPerformance);

        // 3. CALCULAR A RV COM BASE NA PERFORMANCE CORRETA
        const { rvReference, goals } = agentPlan;
        const { regrasRV } = franchiseData;
        
        const safeGoals = goals || {};
        const weights = regrasRV.weights || {};
        const triggers = regrasRV.triggers || {};
        const caps = regrasRV.caps || {};
        
        const newCalculatedRV = { total: 0, kpis: {} };

        kpis.forEach(kpi => {
            const kpiId = kpi.id;
            const goal = safeGoals[kpi.id] || 0;
            const achieved = newPerformance[kpi.id] || 0;
            
            let achievedPercent = (kpiId === 'migracao' || kpi.name.toLowerCase().includes('migração')) ? achieved : (goal > 0 ? (achieved / goal) * 100 : 0);
            let finalPercentForRV = 0;

            if (achievedPercent >= (triggers[kpiId] || 0)) {
                finalPercentForRV = Math.min(achievedPercent, (caps[kpiId] || 100));
            }
            
            const rvValue = (rvReference * (weights[kpiId] / 100)) * (finalPercentForRV / 100);
            newCalculatedRV.kpis[kpiId] = { value: rvValue, percent: achievedPercent.toFixed(2) };
            newCalculatedRV.total += rvValue;
        });

        setCalculatedRV(newCalculatedRV);

    }, [m0Clients, m1Clients, agentPlan, franchiseData]);

    // ... (O restante do código, a partir de handleSubmitForApproval, permanece o mesmo) ...

    const handleSubmitForApproval = async () => {
        if (!window.confirm("Tem a certeza que deseja submeter este mês para aprovação? Após a submissão, não poderá fazer mais alterações até que o seu franqueado aprove ou devolva para correção.")) {
            return;
        }

        const currentMonth = getCurrentMonth();
        const planDocRef = doc(db, "franquias", userProfile.idFranquia, "planos", currentMonth);

        try {
            const planSnap = await getDoc(planDocRef);
            if (planSnap.exists()) {
                const planData = planSnap.data();
                const updatedAgents = planData.agents.map(agent => {
                    if (agent.id === user.uid) {
                        return { ...agent, statusFechamento: 'pendente_aprovacao', comentarioRevisao: '' };
                    }
                    return agent;
                });
                
                await updateDoc(planDocRef, { agents: updatedAgents });
                alert("Mês submetido para aprovação com sucesso!");
            }
        } catch (error) {
            console.error("Erro ao submeter o mês:", error);
            alert("Não foi possível submeter o mês para aprovação.");
        }
    };

    const handleAddM0Client = async (e) => {
        e.preventDefault();
        if (!newClientName || newClientAgreedTPV <= 0) {
            alert("Preencha o nome e um TPV acordado maior que zero.");
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
        if (window.confirm("Tem a certeza que deseja excluir este cliente?")) {
            try {
                await deleteDoc(doc(db, "clientes", clientId));
            } catch (error) {
                console.error("Erro ao excluir cliente: ", error);
            }
        }
    };

    const renderContent = () => {
        if (isLoading && !agentPlan) return <div className="text-center p-8">Carregando dados do agente...</div>;
        if (!agentPlan || !franchiseData) return <div className="text-center p-8 text-red-600">Não foi possível carregar os dados do plano ou da franquia. Contacte o seu franqueado.</div>;
        
        const isMonthClosedForEditing = agentPlan.statusFechamento === 'pendente_aprovacao' || agentPlan.statusFechamento === 'fechado';
        
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
                                {(franchiseData.kpis || []).map(kpi => (
                                    <div key={kpi.id}>
                                        <div className="flex justify-between font-medium">
                                            <p>{kpi.name} ({franchiseData.regrasRV?.weights?.[kpi.id] || 0}%)</p>
                                            <p>{(calculatedRV.kpis[kpi.id]?.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                        </div>
                                        <p className="text-sm text-gray-500">Atingimento: {calculatedRV.kpis[kpi.id]?.percent || '0.00'}%</p>
                                        <p className="text-sm text-gray-500">Meta: {agentPlan.goals?.[kpi.id] || 0} | Realizado: {kpi.name.toLowerCase().includes('migração') ? (performance[kpi.id] || 0).toFixed(2)+'%' : (performance[kpi.id] || 0)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'm0_clients':
                 return (
                    <div className="space-y-8">
                        <div className={`bg-white p-6 rounded-lg shadow ${isMonthClosedForEditing ? 'opacity-50' : ''}`}>
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Adicionar Novo Cliente (M0)</h3>
                            <form onSubmit={handleAddM0Client} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <fieldset disabled={isMonthClosedForEditing} className="contents">
                                    <div className="md:col-span-1"><label className="block text-sm font-medium text-gray-700">Nome do Cliente</label><input type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md"/></div>
                                    <div className="md:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700">TPV Acordado (R$)</label>
                                        <CurrencyInput value={newClientAgreedTPV} onChange={setNewClientAgreedTPV} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="R$ 0,00"/>
                                    </div>
                                    <button type="submit" className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 h-10 disabled:bg-gray-400">Credenciar Cliente</button>
                                </fieldset>
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
                                                <input id={`ativado-${client.id}`} type="checkbox" checked={client.status === 'active'} onChange={() => handleToggleActivation(client.id, client.status)} disabled={isMonthClosedForEditing} className="h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:opacity-50"/>
                                            </div>
                                            <button onClick={() => handleDeleteClient(client.id)} title="Excluir Cliente" disabled={isMonthClosedForEditing}><TrashIcon /></button>
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
                            {(m1Clients || []).map(client => {
                                const migrationPercent = client.agreedTPV > 0 ? ((client.currentTPV || 0) / client.agreedTPV) * 100 : 0;
                                const hasMigrated = migrationPercent >= (franchiseData?.regrasRV?.triggers?.migracao || 70);
                                return (
                                    <div key={client.id} className={`border-b pb-4 ${isMonthClosedForEditing ? 'opacity-50' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {(client.agreedTPV || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                            <div className="w-1/3">
                                                <label className="block text-sm font-medium text-gray-700">TPV Transacionado (R$)</label>
                                                <CurrencyInput
                                                    value={client.currentTPV || 0}
                                                    onChange={(newValue) => {
                                                        if (isMonthClosedForEditing) return;
                                                        setM1Clients(clients => clients.map(c => c.id === client.id ? {...c, currentTPV: newValue} : c));
                                                    }}
                                                    onBlur={(e) => {
                                                        if (isMonthClosedForEditing) return;
                                                        const numericValue = parseFloat(e.target.value.replace(/\D/g, '')) / 100 || 0;
                                                        handleM1TpvChange(client.id, numericValue);
                                                    }}
                                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                                                    placeholder="R$ 0,00"
                                                    disabled={isMonthClosedForEditing}
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
            case 'history':
                return <div>Histórico (em breve)</div>
            default: return null;
        }
    };
    
    const MonthClosingManager = () => {
        if(!agentPlan) return null;
        const status = agentPlan.statusFechamento || 'aberto';
        let statusText = "Em Aberto";
        let statusColor = "bg-blue-100 text-blue-800";

        if (status === 'pendente_aprovacao') {
            statusText = "Pendente de Aprovação";
            statusColor = "bg-yellow-100 text-yellow-800";
        } else if (status === 'fechado') {
            statusText = "Fechado";
            statusColor = "bg-green-100 text-green-800";
        } else if (status === 'em_correcao') {
            statusText = "Devolvido para Correção";
            statusColor = "bg-red-100 text-red-800";
        }

        return (
            <div className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-col sm:flex-row justify-between items-center">
                <div className="mb-4 sm:mb-0">
                    <span className="font-bold text-gray-700">Status do Mês: </span>
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColor}`}>{statusText}</span>
                    {agentPlan?.comentarioRevisao && (status === 'aberto' || status === 'em_correcao') && (
                        <p className="text-sm text-red-600 mt-2">
                            <span className="font-bold">Correção Solicitada:</span> {agentPlan.comentarioRevisao}
                        </p>
                    )}
                </div>
                {(status === 'aberto' || status === 'em_correcao') && (
                    <button 
                        onClick={handleSubmitForApproval}
                        className="bg-green-600 text-white font-bold py-2 px-6 rounded-md hover:bg-green-700 transition-colors"
                    >
                        Submeter para Aprovação
                    </button>
                )}
            </div>
        );
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
                    <button onClick={() => setActiveTab('history')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'history' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Histórico</button>
                </nav>
            </div>
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                <MonthClosingManager />
                {renderContent()}
            </main>
        </div>
    );
}