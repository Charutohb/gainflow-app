import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { doc, getDoc, updateDoc, setDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { CurrencyInput } from './CurrencyInput';

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
);

export default function FranchiseeDashboard({ user, userProfile, handleLogout }) {
    const [activeTab, setActiveTab] = useState('agents');
    const [franchiseData, setFranchiseData] = useState(null);
    const [agentsList, setAgentsList] = useState([]);
    const [allPlans, setAllPlans] = useState({});
    const [selectedPeriod, setSelectedPeriod] = useState("2025-09");
    const [inviteEmail, setInviteEmail] = useState('');
    const [newKpiName, setNewKpiName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [generatedLink, setGeneratedLink] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            if (!userProfile || !userProfile.idFranquia) return;
            setIsLoading(true);
            const franchiseId = userProfile.idFranquia;
            try {
                const franchiseDocRef = doc(db, "franquias", franchiseId);
                const franchiseDocSnap = await getDoc(franchiseDocRef);
                if (franchiseDocSnap.exists()) setFranchiseData(franchiseDocSnap.data());

                const usersQuery = query(collection(db, "users"), where("idFranquia", "==", franchiseId), where("perfil", "==", "agente"));
                const querySnapshot = await getDocs(usersQuery);
                const agents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAgentsList(agents);
                
                const planDocRef = doc(db, "franquias", franchiseId, "planos", selectedPeriod);
                const planDocSnap = await getDoc(planDocRef);
                if (planDocSnap.exists()) {
                    setAllPlans(prev => ({ ...prev, [selectedPeriod]: planDocSnap.data() }));
                } else {
                    setAllPlans(prev => ({ ...prev, [selectedPeriod]: { agents: [] } }));
                }
            } catch (error) {
                console.error("Erro ao buscar dados:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [userProfile, selectedPeriod]);

    const handleGenerateInviteLink = async () => {
        if (!inviteEmail || !inviteEmail.includes('@')) {
            alert('Por favor, insira um email válido.');
            return;
        }
        try {
            const convitesCollectionRef = collection(db, "convites");
            const newInviteDoc = await addDoc(convitesCollectionRef, {
                email: inviteEmail,
                idFranquia: userProfile.idFranquia,
                status: 'pendente',
                criadoEm: new Date(),
            });
            const inviteLink = `${window.location.origin}/?conviteId=${newInviteDoc.id}`;
            setGeneratedLink(inviteLink);
            setInviteEmail('');
        } catch (error) {
            console.error("Erro ao criar convite:", error);
            alert("Não foi possível gerar o link de convite.");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink).then(() => {
            alert("Link copiado para a área de transferência!");
        });
    };

    const handleAgentDataChange = (agentId, field, value) => {
        console.log(`Salvando: Agente ${agentId}, Campo ${field}, Valor ${value}`);
    };
    
    const handleRuleChange = (ruleType, kpiId, value) => {
        const updatedValue = value === '' ? '' : Number(value);
        setFranchiseData(prevData => {
            const newData = JSON.parse(JSON.stringify(prevData));
            if (newData.regrasRV && newData.regrasRV[ruleType]) {
                newData.regrasRV[ruleType][kpiId] = updatedValue;
            }
            return newData;
        });
    };

    const handlePeriodChange = (e) => {
        setSelectedPeriod(e.target.value);
    };

    const handlePlanDataChange = (agentId, field, value, isGoal = false) => {
        setAllPlans(prevPlans => {
            const newPlans = JSON.parse(JSON.stringify(prevPlans));
            if (!newPlans[selectedPeriod]) newPlans[selectedPeriod] = { agents: [] };
            if (!newPlans[selectedPeriod].agents) newPlans[selectedPeriod].agents = [];
            let agentPlan = newPlans[selectedPeriod].agents.find(a => a.id === agentId);
            if (!agentPlan) {
                const agentDetails = agentsList.find(a => a.id === agentId);
                agentPlan = { id: agentId, name: agentDetails.nome, goals: {} };
                newPlans[selectedPeriod].agents.push(agentPlan);
            }
            const updatedValue = isGoal ? (value === '' ? '' : Number(value)) : value;
            if (isGoal) {
                if (!agentPlan.goals) agentPlan.goals = {};
                agentPlan.goals[field] = updatedValue;
            } else {
                agentPlan[field] = updatedValue;
            }
            return newPlans;
        });
    };

    const handleSaveChanges = async (section) => {
        if (!userProfile || !userProfile.idFranquia) return;
        
        try {
            setIsLoading(true);
            const franchiseDocRef = doc(db, "franquias", userProfile.idFranquia);
            
            if (section === 'regrasRV') {
                const rulesToSave = JSON.parse(JSON.stringify(franchiseData.regrasRV));
                Object.keys(rulesToSave).forEach(ruleType => {
                    Object.keys(rulesToSave[ruleType]).forEach(kpiId => {
                        rulesToSave[ruleType][kpiId] = Number(rulesToSave[ruleType][kpiId]) || 0;
                    });
                });
                await updateDoc(franchiseDocRef, { regrasRV: rulesToSave });
                alert("Regras de RV salvas com sucesso!");
            }

            if (section === 'planning') {
                const planData = allPlans[selectedPeriod] || { agents: [] };
                planData.agents.forEach(agent => {
                    agent.rvReference = Number(agent.rvReference) || 0;
                    if (agent.goals) {
                        Object.keys(agent.goals).forEach(kpiId => {
                            agent.goals[kpiId] = Number(agent.goals[kpiId]) || 0;
                        });
                    }
                });
                const planDocRef = doc(db, "franquias", userProfile.idFranquia, "planos", selectedPeriod);
                await setDoc(planDocRef, planData);
                alert("Planeamento salvo com sucesso!");
            }

        } catch (error) {
            console.error("Erro ao salvar alterações:", error);
            alert("Não foi possível salvar as alterações.");
        } finally {
            setIsLoading(false);
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-center p-8">Carregando dados da franquia...</div>;
        if (!franchiseData) return <div className="text-center p-8 text-red-500">Não foi possível carregar os dados da franquia.</div>;
        
        switch (activeTab) {
            case 'agents':
                return (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800">Convidar Novo Agente</h3>
                            <div className="mt-4 flex flex-col sm:flex-row sm:space-x-4">
                                <input type="email" placeholder="email@exemplo.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="flex-1 p-2 border border-gray-300 rounded-md"/>
                                <button onClick={handleGenerateInviteLink} className="mt-2 sm:mt-0 bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600">Gerar Link de Convite</button>
                            </div>
                            {generatedLink && (
                                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                                    <p className="text-sm font-medium text-gray-700">Link de Convite Gerado:</p>
                                    <div className="mt-2 flex items-center space-x-4">
                                        <input type="text" readOnly value={generatedLink} className="flex-1 p-2 bg-white border border-gray-300 rounded-md text-gray-600"/>
                                        <button onClick={copyToClipboard} className="p-2 bg-gray-200 rounded-md hover:bg-gray-300"><CopyIcon /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="bg-white rounded-lg shadow overflow-x-auto">
                            <h3 className="font-bold text-lg text-gray-800 p-6">Agentes da Franquia</h3>
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Nível</th>
                                        <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {agentsList.map(agent => (
                                        <tr key={agent.id}>
                                            <td className="px-6 py-4 font-medium text-gray-900">{agent.nome}</td>
                                            <td className="px-6 py-4">
                                                <select value={agent.level || 'Junior'} onChange={(e) => handleAgentDataChange(agent.id, 'level', e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm">
                                                    <option value="Junior">Junior</option>
                                                    <option value="Pleno">Pleno</option>
                                                    <option value="Sênior">Sênior</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select value={agent.status || 'Ativo'} onChange={(e) => handleAgentDataChange(agent.id, 'status', e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm">
                                                    <option value="Ativo">Ativo</option>
                                                    <option value="Afastado">Afastado</option>
                                                    <option value="Inativo">Inativo</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'planning':
                const activeAgentsDetails = agentsList.filter(a => a.status === 'Ativo');
                const kpisForPlanning = franchiseData.kpis ?? []; 
                return (
                    <div className="bg-white rounded-lg shadow overflow-x-auto">
                        <div className="p-6 border-b">
                            <h3 className="font-bold text-lg text-gray-800">Planejamento de Metas e RV</h3>
                            <div className="mt-4">
                                <label htmlFor="period-select" className="block text-sm font-medium text-gray-700">Selecione o Período:</label>
                                <select id="period-select" value={selectedPeriod} onChange={handlePeriodChange} className="mt-1 block w-full md:w-1/4 p-2 border border-gray-300 rounded-md">
                                    <option value="2025-09">Setembro / 2025</option>
                                    <option value="2025-10">Outubro / 2025</option>
                                    <option value="2025-11">Novembro / 2025</option>
                                    <option value="2025-12">Dezembro / 2025</option>
                                </select>
                            </div>
                        </div>
                        {activeAgentsDetails.length > 0 ? (
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">Agente</th>
                                        <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">Ref. RV (R$)</th>
                                        {kpisForPlanning.map(kpi => (
                                            <th key={kpi.id} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">Meta {kpi.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {activeAgentsDetails.map(agent => {
                                        const agentPlan = allPlans[selectedPeriod]?.agents?.find(p => p.id === agent.id) || {};
                                        return (
                                            <tr key={agent.id}>
                                                <td className="px-4 py-4 font-medium text-gray-900">{agent.nome} <span className="text-xs text-gray-500">({agent.level})</span></td>
                                                <td className="px-4 py-4">
                                                    <CurrencyInput
                                                        value={agentPlan.rvReference ?? 0}
                                                        onChange={(newValue) => handlePlanDataChange(agent.id, 'rvReference', newValue)}
                                                        className="w-full p-2 border border-gray-300 rounded-md"
                                                        placeholder="R$ 0,00"
                                                    />
                                                </td>
                                                {kpisForPlanning.map(kpi => (
                                                    <td key={kpi.id} className="px-4 py-4">
                                                        {kpi.id === 'tpv_transacionado' ? (
                                                            <CurrencyInput
                                                                value={agentPlan.goals?.[kpi.id] ?? 0}
                                                                onChange={(newValue) => handlePlanDataChange(agent.id, kpi.id, newValue, true)}
                                                                className="w-full p-2 border border-gray-300 rounded-md"
                                                                placeholder="R$ 0,00"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                value={agentPlan.goals?.[kpi.id] ?? ''}
                                                                onChange={e => handlePlanDataChange(agent.id, kpi.id, e.target.value, true)}
                                                                className="w-full p-2 border border-gray-300 rounded-md"
                                                            />
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : ( <p className="p-6 text-gray-500">Não há agentes ativos para o planejamento.</p> )}
                        <div className="p-6 bg-gray-50 text-right"><button onClick={() => handleSaveChanges('planning')} className="bg-green-500 text-white font-bold py-2 px-6 rounded-md hover:bg-green-600">Salvar Planejamento</button></div>
                    </div>
                );
            case 'rv_rules':
                const kpis = franchiseData.kpis ?? [];
                const totalWeight = kpis.reduce((sum, kpi) => sum + Number(franchiseData.regrasRV?.weights?.[kpi.id] || 0), 0);
                return (
                    <div className="bg-white p-6 rounded-lg shadow space-y-8">
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">Regras de Cálculo da RV</h3>
                            <p className="text-gray-500 mt-1">Estas regras se aplicam a todos os agentes da franquia.</p>
                        </div>
                        <div className="pt-6 border-t">
                            <h4 className="text-md font-medium text-gray-700">Adicionar Novo KPI</h4>
                             <div className="mt-2 flex space-x-4">
                                <input type="text" placeholder="Ex: Venda de Seguros" value={newKpiName} onChange={e => setNewKpiName(e.target.value)} className="flex-1 p-2 border border-gray-300 rounded-md"/>
                                <button className="bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600">Adicionar</button>
                            </div>
                        </div>
                        {kpis.length > 0 ? (
                            <>
                                <div>
                                    <h4 className="text-md font-medium text-gray-700">1. Pesos dos KPIs</h4>
                                    <p className="text-gray-500 text-sm">Distribua 100% entre os KPIs.</p>
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {kpis.map(kpi => (
                                            <div key={kpi.id} className="flex items-center space-x-2">
                                                <label className="font-medium w-2/5">{kpi.name}:</label>
                                                <input type="number" min="0" max="100" value={franchiseData.regrasRV?.weights?.[kpi.id] ?? ''} onChange={e => handleRuleChange('weights', kpi.id, e.target.value)} className="w-24 p-2 border rounded-md"/>
                                                <span>%</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className={`mt-4 text-lg font-bold ${totalWeight !== 100 ? 'text-red-500' : 'text-green-600'}`}>Total: {totalWeight}% {totalWeight !== 100 && "(A soma deve ser 100%)"}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t">
                                    <div>
                                        <h4 className="text-md font-medium text-gray-700">2. Gatilhos Mínimos (%)</h4>
                                        <div className="space-y-2 mt-4">
                                            {kpis.map(kpi => (
                                                <div key={kpi.id} className="flex items-center justify-between">
                                                    <label>{kpi.name}</label>
                                                    <input type="number" value={franchiseData.regrasRV?.triggers?.[kpi.id] ?? ''} onChange={e => handleRuleChange('triggers', kpi.id, e.target.value)} className="w-24 p-2 border rounded-md"/>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-md font-medium text-gray-700">3. Teto de Atingimento (%)</h4>
                                        <div className="space-y-2 mt-4">
                                            {kpis.map(kpi => (
                                                <div key={kpi.id} className="flex items-center justify-between">
                                                    <label>{kpi.name}</label>
                                                    <input type="number" value={franchiseData.regrasRV?.caps?.[kpi.id] ?? ''} onChange={e => handleRuleChange('caps', kpi.id, e.target.value)} className="w-24 p-2 border rounded-md"/>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 pt-6 border-t border-gray-200 text-right">
                                    <button onClick={() => handleSaveChanges('regrasRV')} className="bg-green-500 text-white font-bold py-2 px-6 rounded-md hover:bg-green-600">Salvar Regras</button>
                                </div>
                            </>
                        ) : (
                           <div className="text-center py-8 text-gray-500"><p>Nenhum KPI cadastrado para esta franquia.</p></div>
                        )}
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <header className="bg-white shadow-sm">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    {/* --- CABEÇALHO CORRIGIDO AQUI --- */}
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            Painel de Franqueado
                        </h1>
                        <p className="text-sm text-gray-600">
                            {userProfile?.nome} (<span className="font-medium text-green-600">{franchiseData?.nome}</span>)
                        </p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-500 hover:text-red-600"><LogoutIcon /><span className="hidden sm:inline">Sair</span></button>
                </div>
            </header>
            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8 overflow-x-auto">
                    <button onClick={() => setActiveTab('agents')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'agents' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Gestão de Agentes</button>
                    <button onClick={() => setActiveTab('planning')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'planning' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Planejamento de Metas e RV</button>
                    <button onClick={() => setActiveTab('rv_rules')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'rv_rules' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Regras de Cálculo da RV</button>
                </nav>
            </div>
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                {renderContent()}
            </main>
        </div>
    );
}
