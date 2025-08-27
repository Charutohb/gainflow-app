import React, { useState } from 'react';

// --- ESTRUTURA DE DADOS INICIAL ---
// Simula como os dados estariam organizados no Firebase

// Dados fixos da franquia e dos agentes
const initialFranchiseData = {
    franchiseName: "Franquia Birigui",
    kpis: [
        { id: 'novosAtivos', name: 'Novos Ativos' },
        { id: 'tpvM1', name: 'TPV M1' },
        { id: 'migracao', name: 'Migração' },
    ],
    agents: [
        { id: 1, name: "Carlos Mendes", level: "Junior", status: 'Ativo' },
        { id: 2, name: "Beatriz Costa", level: "Pleno", status: 'Ativo' },
        { id: 3, name: "Ricardo Alves", level: "Sênior", status: 'Afastado' },
        { id: 4, name: "Juliana Lima", level: "Junior", status: 'Inativo' },
    ],
    rvRules: {
        weights: { novosAtivos: 30, tpvM1: 40, migracao: 30 },
        triggers: { novosAtivos: 70, tpvM1: 70, migracao: 70 },
        caps: { novosAtivos: 200, tpvM1: 200, migracao: 200 },
    }
};

// Dados de planejamento que mudam mês a mês
const initialDbPlans = {
    "2025-09": {
        agents: [
            { id: 1, rvReference: 1200, goals: { novosAtivos: 6, tpvM1: 100000, migracao: 8 } },
            { id: 2, rvReference: 1500, goals: { novosAtivos: 8, tpvM1: 120000, migracao: 10 } },
        ]
    },
    "2025-10": {
        agents: [
            { id: 1, rvReference: 1300, goals: { novosAtivos: 7, tpvM1: 110000, migracao: 9 } },
            { id: 2, rvReference: 1600, goals: { novosAtivos: 9, tpvM1: 130000, migracao: 11 } },
        ]
    }
};

// --- COMPONENTE PRINCIPAL DO PAINEL DO FRANQUEADO ---
export default function FranchiseeDashboard() {
    // --- ESTADOS (States) ---
    const [activeTab, setActiveTab] = useState('planning');
    const [franchiseData, setFranchiseData] = useState(initialFranchiseData);
    const [allPlans, setAllPlans] = useState(initialDbPlans);
    const [selectedPeriod, setSelectedPeriod] = useState("2025-09");
    const [inviteEmail, setInviteEmail] = useState('');
    const [newKpiName, setNewKpiName] = useState('');

    // --- FUNÇÕES DE MANIPULAÇÃO (Handlers) ---

    const handleInviteAgent = () => {
        if (!inviteEmail || !inviteEmail.includes('@')) {
            alert('Por favor, insira um email válido.');
            return;
        }
        const newAgent = {
            id: Date.now(),
            name: inviteEmail,
            level: 'Junior',
            status: 'Convite Pendente'
        };
        setFranchiseData(currentData => ({
            ...currentData,
            agents: [...currentData.agents, newAgent]
        }));
        setInviteEmail('');
        alert(`Convite enviado para ${inviteEmail}!`);
    };

    const handleAddNewKpi = () => {
        if (!newKpiName.trim()) {
            alert("O nome do KPI não pode estar em branco.");
            return;
        }
        const newKpiId = newKpiName.trim().toLowerCase().replace(/\s+/g, '_');
        if (franchiseData.kpis.some(kpi => kpi.id === newKpiId)) {
            alert("Já existe um KPI com um ID similar. Escolha um nome diferente.");
            return;
        }

        setFranchiseData(currentData => ({
            ...currentData,
            kpis: [...currentData.kpis, { id: newKpiId, name: newKpiName.trim() }],
            rvRules: {
                weights: { ...currentData.rvRules.weights, [newKpiId]: 0 },
                triggers: { ...currentData.rvRules.triggers, [newKpiId]: 70 },
                caps: { ...currentData.rvRules.caps, [newKpiId]: 200 },
            }
        }));
        setNewKpiName('');
    };

    const handleAgentDataChange = (agentId, field, value) => {
        setFranchiseData(currentData => ({
            ...currentData,
            agents: currentData.agents.map(agent =>
                agent.id === agentId ? { ...agent, [field]: value } : agent
            )
        }));
    };
    
    const handleRuleChange = (ruleType, kpiId, value) => {
        setFranchiseData(currentData => ({
            ...currentData,
            rvRules: {
                ...currentData.rvRules,
                [ruleType]: {
                    ...currentData.rvRules[ruleType],
                    [kpiId]: Number(value)
                }
            }
        }));
    };

    const handlePeriodChange = (e) => {
        setSelectedPeriod(e.target.value);
    };

    const handlePlanDataChange = (agentId, field, value, isGoal = false) => {
        const currentPlan = allPlans[selectedPeriod] || { agents: [] };
        const agentPlanExists = currentPlan.agents.some(p => p.id === agentId);
        let updatedAgentPlans;

        if (agentPlanExists) {
            updatedAgentPlans = currentPlan.agents.map(plan => {
                if (plan.id === agentId) {
                    if (isGoal) {
                        return { ...plan, goals: { ...(plan.goals || {}), [field]: Number(value) } };
                    }
                    return { ...plan, [field]: Number(value) };
                }
                return plan;
            });
        } else {
            const agentInfo = franchiseData.agents.find(a => a.id === agentId);
            const newPlanData = { id: agentId };
            if (isGoal) {
                newPlanData.goals = { [field]: Number(value) };
            } else {
                newPlanData[field] = Number(value);
            }
            updatedAgentPlans = [...currentPlan.agents, newPlanData];
        }

        setAllPlans(currentPlans => ({
            ...currentPlans,
            [selectedPeriod]: { agents: updatedAgentPlans }
        }));
    };

    const totalWeight = franchiseData.kpis.reduce((sum, kpi) => sum + (franchiseData.rvRules.weights[kpi.id] || 0), 0);

    const getStatusClass = (status) => {
        switch (status) {
            case 'Ativo': return 'bg-green-100 text-green-800';
            case 'Afastado': return 'bg-gray-100 text-gray-800';
            case 'Inativo': return 'bg-red-100 text-red-800';
            case 'Convite Pendente': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // --- RENDERIZAÇÃO DO CONTEÚDO DA ABA ATIVA ---
    const renderContent = () => {
        switch (activeTab) {
            case 'agents':
                return (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800">Convidar Novo Agente</h3>
                            <div className="mt-4 flex flex-col sm:flex-row sm:space-x-4">
                                <input type="email" placeholder="email@exemplo.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                                <button onClick={handleInviteAgent} className="mt-2 sm:mt-0 bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600">Enviar Convite</button>
                            </div>
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
                                    {franchiseData.agents.map(agent => (
                                        <tr key={agent.id}>
                                            <td className="px-6 py-4 font-medium text-gray-900">{agent.name}</td>
                                            <td className="px-6 py-4">
                                                <select value={agent.level} onChange={(e) => handleAgentDataChange(agent.id, 'level', e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm">
                                                    <option value="Junior">Junior</option>
                                                    <option value="Pleno">Pleno</option>
                                                    <option value="Sênior">Sênior</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select value={agent.status} onChange={(e) => handleAgentDataChange(agent.id, 'status', e.target.value)} className={`p-2 border rounded-md text-sm ${getStatusClass(agent.status).replace('bg-', 'border-').replace('-100', '-300')}`}>
                                                    <option value="Ativo">Ativo</option>
                                                    <option value="Afastado">Afastado</option>
                                                    <option value="Inativo">Inativo</option>
                                                    {agent.status === 'Convite Pendente' && <option value="Convite Pendente" disabled>Convite Pendente</option>}
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
                const activeAgentsDetails = franchiseData.agents.filter(a => a.status === 'Ativo');
                const currentPlanAgents = allPlans[selectedPeriod]?.agents || [];
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
                                        {franchiseData.kpis.map(kpi => (
                                            <th key={kpi.id} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase">Meta {kpi.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {activeAgentsDetails.map(agent => {
                                        const agentPlan = currentPlanAgents.find(p => p.id === agent.id) || {};
                                        return (
                                            <tr key={agent.id}>
                                                <td className="px-4 py-4 font-medium text-gray-900">{agent.name} <span className="text-xs text-gray-500">({agent.level})</span></td>
                                                <td className="px-4 py-4"><input type="number" placeholder="R$ 0,00" value={agentPlan.rvReference || ''} onChange={e => handlePlanDataChange(agent.id, 'rvReference', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md"/></td>
                                                {franchiseData.kpis.map(kpi => (
                                                    <td key={kpi.id} className="px-4 py-4">
                                                        <input type="number" placeholder="0" value={agentPlan.goals?.[kpi.id] || ''} onChange={e => handlePlanDataChange(agent.id, kpi.id, e.target.value, true)} className="w-full p-2 border border-gray-300 rounded-md"/>
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : ( <p className="p-6 text-gray-500">Não há agentes ativos para o planejamento.</p> )}
                        <div className="p-6 bg-gray-50 text-right"><button className="bg-green-500 text-white font-bold py-2 px-6 rounded-md hover:bg-green-600">Salvar Planejamento de {selectedPeriod}</button></div>
                    </div>
                );
            case 'rv_rules':
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
                                <button onClick={handleAddNewKpi} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600">Adicionar</button>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-md font-medium text-gray-700">1. Pesos dos KPIs</h4>
                            <p className="text-gray-500 text-sm">Distribua 100% entre os KPIs para definir a importância de cada um na RV.</p>
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                                {franchiseData.kpis.map(kpi => (
                                    <div key={kpi.id}>
                                        <label className="font-medium">{kpi.name}: {franchiseData.rvRules.weights[kpi.id] || 0}%</label>
                                        <input type="range" min="0" max="100" value={franchiseData.rvRules.weights[kpi.id] || 0} onChange={e => handleRuleChange('weights', kpi.id, e.target.value)} className="w-full"/>
                                    </div>
                                ))}
                            </div>
                             <div className={`mt-4 text-lg font-bold ${totalWeight !== 100 ? 'text-red-500' : 'text-green-600'}`}>Total: {totalWeight}% {totalWeight !== 100 && "(A soma deve ser 100%)"}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t">
                            <div>
                                <h4 className="text-md font-medium text-gray-700">2. Gatilhos Mínimos (%)</h4>
                                <div className="space-y-2 mt-4">
                                    {franchiseData.kpis.map(kpi => (
                                        <div key={kpi.id} className="flex items-center justify-between">
                                            <label>{kpi.name}</label>
                                            <input type="number" value={franchiseData.rvRules.triggers[kpi.id] || 0} onChange={e => handleRuleChange('triggers', kpi.id, e.target.value)} className="w-24 p-2 border rounded-md"/>
                                        </div>
                                    ))}
                                </div>
                            </div>
                             <div>
                                <h4 className="text-md font-medium text-gray-700">3. Teto de Atingimento (%)</h4>
                                <div className="space-y-2 mt-4">
                                    {franchiseData.kpis.map(kpi => (
                                        <div key={kpi.id} className="flex items-center justify-between">
                                            <label>{kpi.name}</label>
                                            <input type="number" value={franchiseData.rvRules.caps[kpi.id] || 0} onChange={e => handleRuleChange('caps', kpi.id, e.target.value)} className="w-24 p-2 border rounded-md"/>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                         <div className="mt-8 pt-6 border-t border-gray-200 text-right"><button className="bg-green-500 text-white font-bold py-2 px-6 rounded-md hover:bg-green-600">Salvar Regras</button></div>
                    </div>
                );
            default: return null;
        }
    };

    // --- ESTRUTURA PRINCIPAL DO JSX ---
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <header className="bg-white shadow-sm">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
                    <h1 className="text-2xl font-bold text-gray-800">Painel do Franqueado: <span className="text-green-500">{franchiseData.franchiseName}</span></h1>
                </div>
            </header>
            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8">
                    <button onClick={() => setActiveTab('agents')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'agents' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Gestão de Agentes</button>
                    <button onClick={() => setActiveTab('planning')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'planning' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Planejamento de Metas e RV</button>
                    <button onClick={() => setActiveTab('rv_rules')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'rv_rules' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Regras de Cálculo da RV</button>
                </nav>
            </div>
            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                {renderContent()}
            </main>
        </div>
    );
}