import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CurrencyInput } from './CurrencyInput';
import { formatCurrency } from './utils/formatters';

// --- Ícones e Funções Utilitárias ---
const LogoutIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> );
const TrashIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-600"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> );
const getMigrationBarColor = (percentage) => { if (percentage >= 100) return 'bg-green-500'; if (percentage >= 50) return 'bg-blue-500'; if (percentage > 30) return 'bg-yellow-500'; return 'bg-red-500'; };
const getDefaultPeriod = () => new Date().toISOString().slice(0, 7);
// --- FIM DOS ÍCONES ---

export default function AgentDashboard({ user, userProfile, handleLogout }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedPeriod, setSelectedPeriod] = useState(getDefaultPeriod);
    const [isLoading, setIsLoading] = useState(true);
    const [agentPlan, setAgentPlan] = useState(null);
    const [franchiseData, setFranchiseData] = useState(null);
    const [m0Clients, setM0Clients] = useState([]);
    const [m1Clients, setM1Clients] = useState([]);
    
    const [newClientName, setNewClientName] = useState('');
    const [newClientAgreedTPV, setNewClientAgreedTPV] = useState(0);
    const [performance, setPerformance] = useState({});
    const [calculatedRV, setCalculatedRV] = useState({ total: 0, kpis: {} });

    // useEffect para buscar os dados (Plano, Franquia, Clientes M0/M1)
    useEffect(() => {
        if (!user || !userProfile || !userProfile.idFranquia) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        
        const franchiseId = userProfile.idFranquia;
        const agentId = user.uid;
        
        const date = new Date(`${selectedPeriod}-02T00:00:00`);
        date.setMonth(date.getMonth() - 1);
        const previousMonth = date.toISOString().slice(0, 7);

        // Busca o plano do agente para o período
        const planDocRef = doc(db, "franquias", franchiseId, "planos", selectedPeriod);
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

        // Busca dados gerais da franquia (KPIs, Regras)
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

        // Busca clientes M0 (do período selecionado)
        const m0Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", selectedPeriod));
        const unsubscribeM0 = onSnapshot(m0Query, (querySnapshot) => {
            setM0Clients(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Busca clientes M1 (do mês anterior)
        const m1Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", previousMonth), where("status", "==", "active"));
        const unsubscribeM1 = onSnapshot(m1Query, (querySnapshot) => {
            setM1Clients(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        
        // Limpa os listeners ao desmontar ou trocar o período
        return () => {
            unsubscribePlan();
            unsubscribeM0();
            unsubscribeM1();
        };
    }, [user, userProfile, selectedPeriod]);
    
    // useEffect para calcular a ESTIMATIVA de RV
    useEffect(() => {
        // Só calcula se os dados necessários existirem
        if (!agentPlan || !franchiseData || !franchiseData.kpis || !franchiseData.regrasRV) {
            setPerformance({});
            setCalculatedRV({ total: 0, kpis: {} });
            return;
        }

        // --- Início da Lógica de Cálculo ---
        const { kpis, regrasRV } = franchiseData;
        
        // Métricas Brutas
        const totalNovosAtivos = m0Clients.filter(client => client.status === 'active').length;
        const totalTpvTransacionado = m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0);
        const totalTpvAcordado = m1Clients.reduce((sum, client) => sum + (client.agreedTPV || 0), 0);
        
        const individualSuccessTrigger = regrasRV.triggers?.migracao_individual || 70;
        const successfulMigratorsCount = m1Clients.filter(c => {
            if (c.agreedTPV <= 0) return false;
            const individualMigration = ((c.currentTPV || 0) / c.agreedTPV) * 100;
            return individualMigration >= individualSuccessTrigger;
        }).length;
        const migracaoDisplayPercent = m1Clients.length > 0 ? (successfulMigratorsCount / m1Clients.length) * 100 : 0;

        // Performance (Realizado)
        const newPerformance = {};
        kpis.forEach(kpi => {
            if (kpi.name.toLowerCase().includes('novos ativos')) {
                newPerformance[kpi.id] = totalNovosAtivos;
            } else if (kpi.name.toLowerCase().includes('tpv transacionado')) {
                newPerformance[kpi.id] = totalTpvTransacionado;
            } else if (kpi.name.toLowerCase().includes('migração')) {
                newPerformance[kpi.id] = migracaoDisplayPercent;
            }
        });
        setPerformance(newPerformance);

        // Cálculo do RV
        const { rvReference, goals } = agentPlan;
        const safeGoals = goals || {}; // Garante que 'goals' exista
        const weights = regrasRV.weights || {};
        const triggers = regrasRV.triggers || {};
        const caps = regrasRV.caps || {};

        const newCalculatedRV = { total: 0, kpis: {} };

        kpis.forEach(kpi => {
            const kpiId = kpi.id;
            const goal = safeGoals[kpi.id] || 0;
            const achievedForDisplay = newPerformance[kpi.id] || 0;
            const kpiTrigger = triggers[kpiId] || 0;
            const kpiCap = caps[kpiId] || 100;
            
            let finalPercentForRV = 0;
            let percentualDeAtingimentoParaExibicao = 0;
            let percentualParaCalculoDeRV = 0;
            let valorParaChecarGatilho = 0;

            if (kpi.name.toLowerCase().includes('migração')) {
                percentualParaCalculoDeRV = goal > 0 ? (achievedForDisplay / goal) * 100 : 0;
                percentualDeAtingimentoParaExibicao = achievedForDisplay;
                valorParaChecarGatilho = achievedForDisplay;
            } else {
                percentualParaCalculoDeRV = goal > 0 ? (achievedForDisplay / goal) * 100 : 0;
                percentualDeAtingimentoParaExibicao = percentualParaCalculoDeRV;
                valorParaChecarGatilho = percentualParaCalculoDeRV;
            }

            if (valorParaChecarGatilho >= kpiTrigger) {
                finalPercentForRV = Math.min(percentualParaCalculoDeRV, kpiCap);
            }

            const rvValue = ((rvReference || 0) * (weights[kpiId] / 100)) * (finalPercentForRV / 100);
            
            newCalculatedRV.kpis[kpi.id] = { value: rvValue, percent: percentualDeAtingimentoParaExibicao.toFixed(2) };
            newCalculatedRV.total += rvValue;
        });

        setCalculatedRV(newCalculatedRV);
        // --- Fim da Lógica de Cálculo ---

    }, [m0Clients, m1Clients, agentPlan, franchiseData]);

    // --- Funções 'Handle' (Ações do Usuário) ---

    // VERSÃO FINAL: Submete para aprovação do Franqueado
    const handleSubmitForApproval = async () => {
        if (!window.confirm("Tem a certeza que deseja submeter este mês para aprovação? Após a submissão, não poderá fazer mais alterações até que o seu franqueado aprove ou devolva para correção.")) {
            return;
        }
        
        // Pega o valor da estimativa atual para salvar junto (útil para o franqueado ver)
        const estimativaAtual = calculatedRV.total;

        const planDocRef = doc(db, "franquias", userProfile.idFranquia, "planos", selectedPeriod);
        try {
            const planSnap = await getDoc(planDocRef);
            if (planSnap.exists()) {
                const planData = planSnap.data();
                const updatedAgents = planData.agents.map(agent => {
                    if (agent.id === user.uid) {
                        return { 
                            ...agent, 
                            statusFechamento: 'pendente_aprovacao', 
                            comentarioRevisao: '',
                            rvEstimadoSubmetido: estimativaAtual // Salvamos a estimativa no momento do envio
                        };
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
                monthAdded: selectedPeriod,
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

    // --- Renderização do Conteúdo da Aba Ativa ---
    const renderContent = () => {
        // Estados de Carregamento / Erro
        if (isLoading && !agentPlan) return <div className="text-center p-8">Carregando dados do agente...</div>;
        if (!agentPlan || !franchiseData) return <div className="text-center p-8 text-red-600">Não foi possível carregar os dados do plano ou da franquia. Contacte o seu franqueado.</div>;
        
        // Verifica se o mês está fechado para edição
        const isMonthClosedForEditing = agentPlan.statusFechamento === 'pendente_aprovacao' || agentPlan.statusFechamento === 'fechado';
        
        switch (activeTab) {
            
            // --- ABA DASHBOARD (Opção 2: Com Detalhamento) ---
            case 'dashboard': {
                
                // 1. Verifica o status do plano carregado
                const status = agentPlan?.statusFechamento;
                const isClosed = status === 'fechado';

                // 2. Decide qual valor e título exibir
                const rvToShow = isClosed ? (agentPlan?.rvFinal || 0) : calculatedRV.total;
                const titleText = isClosed ? "Sua RV Fechada" : "Sua RV Estimada";
                
                // 3. Define a cor do card
                const cardColor = isClosed ? "bg-gray-600" : "bg-green-600";
                const titleColor = isClosed ? "text-gray-200" : "text-green-200";

                return (
                    <div className="space-y-8">
                        {/* Card Principal */}
                        <div className={`${cardColor} text-white p-6 rounded-lg shadow-lg text-center`}>
                            <h2 className={`text-lg font-semibold ${titleColor}`}>{titleText} ({selectedPeriod})</h2>
                            <p className="text-5xl font-bold mt-2">
                                {rvToShow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            {isClosed && (
                                <p className="text-sm text-gray-200 mt-2">(Este é o valor final aprovado pelo seu franqueado)</p>
                            )}
                        </div>
                        
                        {/* --- MUDANÇA: Card de Detalhamento Re-adicionado --- */}
                        {/* Só exibe o detalhamento se o mês NÃO estiver fechado */}
                        {!isClosed && (
                            <div className="bg-white p-6 rounded-lg shadow">
                                <h3 className="font-bold text-lg text-gray-800 mb-4">Detalhamento da RV Estimada</h3>
                                <div className="space-y-4">
                                    {(franchiseData.kpis || []).map(kpi => {
                                        const isMigracao = kpi.name.toLowerCase().includes('migração');
                                        const isTpv = kpi.name.toLowerCase().includes('tpv transacionado');
                                        // Garante que agentPlan.goals exista antes de tentar acessá-lo
                                        const metaValue = agentPlan.goals?.[kpi.id] || 0;
                                        const realizadoValue = performance[kpi.id] || 0;
                                        
                                        const formatMeta = () => {
                                            if (isMigracao) return `${metaValue}%`;
                                            if (isTpv) return formatCurrency(metaValue);
                                            return metaValue;
                                        };
                                        const formatRealizado = () => {
                                            if (isMigracao) return `${realizadoValue.toFixed(2)}%`;
                                            if (isTpv) return formatCurrency(realizadoValue);
                                            return realizadoValue;
                                        };
                                        
                                        return (
                                            <div key={kpi.id}>
                                                <div className="flex justify-between font-medium">
                                                    <p>{kpi.name} ({franchiseData.regrasRV?.weights?.[kpi.id] || 0}%)</p>
                                                    <p>{(calculatedRV.kpis[kpi.id]?.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                                </div>
                                                <p className="text-sm text-gray-500">Atingimento: {calculatedRV.kpis[kpi.id]?.percent || '0.00'}%</p>
                                                <p className="text-sm text-gray-500">Meta: {formatMeta()} | Realizado: {formatRealizado()}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {/* --- FIM DA MUDANÇA --- */}


                        {/* Card de Ajuda */}
                        <div className="bg-white p-6 rounded-lg shadow text-gray-700">
                            <h3 className="font-bold text-lg text-gray-800 mb-2">Como esta RV é calculada?</h3>
                            <p>
                                Seu Resultado Variável (RV) é calculado automaticamente com base nos KPIs:
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>
                                    <strong>Novos Ativos:</strong> Baseado nos novos clientes credenciados e ativados neste mês (ver aba "Clientes M0").
                                </li>
                                <li>
                                    <strong>TPV Transacionado e Migração:</strong> Baseado no TPV que você preenche para os clientes do mês anterior (ver aba "Clientes M1").
                                </li>
                            </ul>
                            <p className="mt-2">
                                O valor final depende das metas e regras definidas pelo seu franqueado para o período selecionado.
                            </p>
                        </div>
                    </div>
                );
            } // Fim do 'case: dashboard'

            // --- ABA CLIENTES M0 ---
            case 'm0_clients':
                return (
                    <div className="space-y-8">
                        {/* Formulário de Adição */}
                        <div className={`bg-white p-6 rounded-lg shadow ${isMonthClosedForEditing ? 'opacity-50' : ''}`}>
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Adicionar Novo Cliente (Mês: {selectedPeriod})</h3>
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
                        {/* Lista de Clientes M0 */}
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Atual (M0)</h3>
                            <ul className="divide-y divide-gray-200">
                                {m0Clients.map(client => (
                                    <li key={client.id} className="py-4 flex items-center justify-between">
                                        <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {formatCurrency(client.agreedTPV)}</p></div>
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

            // --- ABA CLIENTES M1 ---
            case 'm1_clients':
                return (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Anterior (M1)</h3>
                        <div className="space-y-6">
                            {(m1Clients || []).map(client => {
                                const migrationPercent = client.agreedTPV > 0 ? ((client.currentTPV || 0) / client.agreedTPV) * 100 : 0;
                                const barColorClass = getMigrationBarColor(migrationPercent);
                                return (
                                    <div key={client.id} className={`border-b pb-4 ${isMonthClosedForEditing ? 'opacity-50' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {formatCurrency(client.agreedTPV)}</p></div>
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
                                                        // O onBlur é o que salva no DB
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
                                            <div className="flex justify-between mb-1"><span className="text-sm font-medium text-gray-700">Progresso de Migração</span><span className="text-sm font-bold">{migrationPercent.toFixed(1)}%</span></div>
                                            <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${barColorClass}`} style={{ width: `${Math.min(migrationPercent, 100)}%` }}></div></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            
            // A aba 'history' foi removida
            
            default: return null;
        }
    };
    
    // --- Componente de Gerenciamento de Fechamento ---
    const MonthClosingManager = () => {
        if(!agentPlan) return null; // Não mostra nada se o plano não estiver carregado
        
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
                    
                    {/* Mostra comentário de revisão se houver */}
                    {agentPlan?.comentarioRevisao && (status === 'aberto' || status === 'em_correcao') && (
                        <p className="text-sm text-red-600 mt-2">
                            <span className="font-bold">Correção Solicitada:</span> {agentPlan.comentarioRevisao}
                        </p>
                    )}
                </div>
                
                {/* Mostra o botão de submeter apenas se o status permitir */}
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

    // --- JSX Principal do Componente ---
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            {/* Header */}
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
            
            {/* Navegação por Abas (Simplificada) */}
            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8 overflow-x-auto">
                    <button onClick={() => setActiveTab('dashboard')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'dashboard' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Dashboard RV</button>
                    <button onClick={() => setActiveTab('m0_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm0_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M0</button>
                    <button onClick={() => setActiveTab('m1_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'm1_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M1</button>
                </nav>
            </div>
            
            {/* Conteúdo Principal */}
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                {/* Seletor de Período */}
                <div className="mb-6">
                    <label htmlFor="period-select" className="block text-sm font-medium text-gray-700">Selecione o Mês de Referência:</label>
                    <select 
                        id="period-select" 
                        value={selectedPeriod} 
                        onChange={e => setSelectedPeriod(e.target.value)} 
                        className="mt-1 block w-full md:w-1/4 p-2 border border-gray-300 rounded-md bg-white shadow-sm"
                    >
                        <option value="2025-12">Dezembro / 2025</option>
                        <option value="2025-11">Novembro / 2025</option>
                        <option value="2025-10">Outubro / 2025</option>
                        <option value="2025-09">Setembro / 2025</option>
                        <option value="2025-08">Agosto / 2025</option>
                    </select>
                </div>
                
                {/* Gerenciador de Fechamento (Status e Botão) */}
                <MonthClosingManager /> 
                
                {/* Conteúdo da Aba */}
                {renderContent()}
            </main>
        </div>
    );
}