import React, { useState, useEffect } from 'react';

// --- SIMULAÇÃO DOS DADOS QUE VIRIAM DO FIREBASE ---

// Regras e KPIs definidos pelo franqueado
const fetchedFranchiseData = {
    kpis: [
        { id: 'novosAtivos', name: 'Novos Ativos' },
        { id: 'tpvM1', name: 'TPV M1' },
        { id: 'migracao', name: 'Migração' },
    ],
    rvRules: {
        weights: { novosAtivos: 30, tpvM1: 40, migracao: 30 },
        triggers: { novosAtivos: 70, tpvM1: 70, migracao: 70 }, // Gatilho de migração é 70%
        caps: { novosAtivos: 200, tpvM1: 200, migracao: 200 },
    }
};

// Plano do mês para o agente logado
const fetchedAgentPlan = {
    name: "Carlos Mendes",
    level: "Junior",
    rvReference: 1200,
    goals: { novosAtivos: 6, tpvM1: 100000, migracao: 8 },
};

// Carteira de clientes do agente
const initialM0Clients = [
    { id: 1, name: 'Padaria Pão Quente', agreedTPV: 15000, activated: true },
    { id: 2, name: 'Loja de Roupas Stilo', agreedTPV: 8000, activated: false },
];
const initialM1Clients = [
    { id: 3, name: 'Oficina do Zé', agreedTPV: 20000, currentTPV: 18000 },
    { id: 4, name: 'Mercado Central', agreedTPV: 30000, currentTPV: 15000 },
    { id: 5, name: 'Pet Shop Amigo Fiel', agreedTPV: 12000, currentTPV: 12000 },
];


// --- COMPONENTE DA TELA DO AGENTE ---
export default function AgentDashboard() {
    // --- ESTADOS (States) ---
    const [activeTab, setActiveTab] = useState('dashboard');
    const [agentPlan] = useState(fetchedAgentPlan);
    const [franchiseData] = useState(fetchedFranchiseData);
    
    // Estados da carteira de clientes
    const [m0Clients, setM0Clients] = useState(initialM0Clients);
    const [m1Clients, setM1Clients] = useState(initialM1Clients);

    // Estados do formulário de novo cliente
    const [newClientName, setNewClientName] = useState('');
    const [newClientAgreedTPV, setNewClientAgreedTPV] = useState('');

    // Estado da performance (calculado automaticamente)
    const [performance, setPerformance] = useState({ novosAtivos: 0, tpvM1: 0, migracao: 0 });
    const [calculatedRV, setCalculatedRV] = useState({ total: 0, kpis: {} });

    // --- LÓGICA DE CÁLCULO AUTOMÁTICO ---

    // 1. Efeito que recalcula a PERFORMANCE quando a carteira de clientes muda
    useEffect(() => {
        // Calcula Novos Ativos a partir da lista M0
        const totalNovosAtivos = m0Clients.filter(client => client.activated).length;

        // Calcula TPV M1 a partir da lista M1
        const totalTpvM1 = m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0);

        // Calcula Migração a partir da lista M1 e da regra do franqueado
        const migrationTriggerPercent = franchiseData.rvRules.triggers.migracao || 70;
        const totalMigracao = m1Clients.filter(client => {
            if (!client.agreedTPV || client.agreedTPV === 0) return false;
            const migrationPercent = ((client.currentTPV || 0) / client.agreedTPV) * 100;
            return migrationPercent >= migrationTriggerPercent;
        }).length;

        setPerformance({
            novosAtivos: totalNovosAtivos,
            tpvM1: totalTpvM1,
            migracao: totalMigracao,
        });
    }, [m0Clients, m1Clients, franchiseData]);

    // 2. Efeito que recalcula a RV quando a PERFORMANCE muda
    useEffect(() => {
        const { rvReference, goals } = agentPlan;
        const { kpis, rvRules } = franchiseData;
        const { weights, triggers, caps } = rvRules;
        const newCalculatedRV = { total: 0, kpis: {} };

        kpis.forEach(kpi => {
            const kpiId = kpi.id;
            const goal = goals[kpiId] || 0;
            const achieved = performance[kpiId] || 0;

            if (goal > 0) {
                let achievedPercent = (achieved / goal) * 100;
                let finalPercent = 0;
                if (achievedPercent >= triggers[kpiId]) {
                    finalPercent = Math.min(achievedPercent, caps[kpiId]);
                }
                const rvValue = (rvReference * (weights[kpiId] / 100)) * (finalPercent / 100);
                newCalculatedRV.kpis[kpiId] = { value: rvValue, percent: achievedPercent.toFixed(2) };
                newCalculatedRV.total += rvValue;
            } else {
                 newCalculatedRV.kpis[kpiId] = { value: 0, percent: 0 };
            }
        });
        setCalculatedRV(newCalculatedRV);
    }, [performance, agentPlan, franchiseData]);

    // --- FUNÇÕES DE MANIPULAÇÃO (Handlers) ---

    const handleAddM0Client = (e) => {
        e.preventDefault();
        if (!newClientName || !newClientAgreedTPV) {
            alert("Preencha o nome e o TPV acordado.");
            return;
        }
        const newClient = {
            id: Date.now(),
            name: newClientName,
            agreedTPV: Number(newClientAgreedTPV),
            activated: false
        };
        setM0Clients(current => [...current, newClient]);
        setNewClientName('');
        setNewClientAgreedTPV('');
    };

    const handleToggleActivation = (clientId) => {
        setM0Clients(current => current.map(client => 
            client.id === clientId ? { ...client, activated: !client.activated } : client
        ));
    };

    const handleM1TpvChange = (clientId, value) => {
        setM1Clients(current => current.map(client => 
            client.id === clientId ? { ...client, currentTPV: Number(value) } : client
        ));
    };

    // --- RENDERIZAÇÃO ---

    const renderContent = () => {
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
                                        <div className="flex justify-between font-medium"><p>{kpi.name} ({franchiseData.rvRules.weights[kpi.id]}%)</p><p>{(calculatedRV.kpis[kpi.id]?.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
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
                                <div className="md:col-span-1"><label className="block text-sm font-medium text-gray-700">TPV Acordado (R$)</label><input type="number" value={newClientAgreedTPV} onChange={e => setNewClientAgreedTPV(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md"/></div>
                                <button type="submit" className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 h-10">Adicionar</button>
                            </form>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="font-bold text-lg text-gray-800 mb-4">Clientes do Mês Atual (M0)</h3>
                            <ul className="divide-y divide-gray-200">
                                {m0Clients.map(client => (
                                    <li key={client.id} className="py-4 flex items-center justify-between">
                                        <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {client.agreedTPV.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                        <div className="flex items-center"><label htmlFor={`ativado-${client.id}`} className="mr-2 text-sm font-medium text-gray-700">Ativado:</label><input id={`ativado-${client.id}`} type="checkbox" checked={client.activated} onChange={() => handleToggleActivation(client.id)} className="h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500"/></div>
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
                                const hasMigrated = migrationPercent >= (franchiseData.rvRules.triggers.migracao || 70);
                                return (
                                    <div key={client.id} className="border-b pb-4">
                                        <div className="flex justify-between items-start">
                                            <div><p className="font-medium text-gray-900">{client.name}</p><p className="text-sm text-gray-500">TPV Acordado: {client.agreedTPV.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                            <div className="w-1/3"><label className="block text-sm font-medium text-gray-700">TPV Transacionado (R$)</label><input type="number" value={client.currentTPV || ''} onChange={e => handleM1TpvChange(client.id, e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md"/></div>
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
                    <h1 className="text-2xl font-bold text-gray-800"><span className="text-green-500">Gain</span>Flow</h1>
                    <div className="text-right"><p className="font-bold text-gray-800">{agentPlan.name}</p><p className="text-sm text-gray-500">{agentPlan.level}</p></div>
                </div>
            </header>

            <div className="bg-white shadow-sm">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex space-x-8">
                    <button onClick={() => setActiveTab('dashboard')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'dashboard' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Dashboard RV</button>
                    <button onClick={() => setActiveTab('m0_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'm0_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M0 (Mês Atual)</button>
                    <button onClick={() => setActiveTab('m1_clients')} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'm1_clients' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes M1 (Mês Anterior)</button>
                </nav>
            </div>

            <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
                {renderContent()}
            </main>
        </div>
    );
}