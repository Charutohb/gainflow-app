// Caminho: ./AgentPerformanceDetail.jsx

import React, { useState, useEffect } from 'react';
import { db } from './firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { formatCurrency } from './utils/formatters';

export default function AgentPerformanceDetail({ agentId, selectedPeriod }) {
    const [isLoading, setIsLoading] = useState(true);
    const [m0Clients, setM0Clients] = useState([]);
    const [m1Clients, setM1Clients] = useState([]);

    const date = new Date(`${selectedPeriod}-02T00:00:00`);
    const currentMonth = date.toISOString().slice(0, 7);
    date.setMonth(date.getMonth() - 1);
    const previousMonth = date.toISOString().slice(0, 7);

    useEffect(() => {
        const fetchClientDetails = async () => {
            if (!agentId || !selectedPeriod) return;

            setIsLoading(true);
            try {
                // Buscar clientes M0 (do mês de referência)
                const m0Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", currentMonth));
                const m0Snapshot = await getDocs(m0Query);
                setM0Clients(m0Snapshot.docs.map(doc => doc.data()));

                // --- CORREÇÃO APLICADA AQUI ---
                // Buscar clientes M1 (do mês anterior) que estão com status 'ativo'
                const m1Query = query(collection(db, "clientes"), where("agentId", "==", agentId), where("monthAdded", "==", previousMonth), where("status", "==", "active"));
                const m1Snapshot = await getDocs(m1Query);
                setM1Clients(m1Snapshot.docs.map(doc => doc.data()));

            } catch (error) {
                console.error("Erro ao buscar detalhes dos clientes:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchClientDetails();
    }, [agentId, selectedPeriod, currentMonth, previousMonth]);

    if (isLoading) {
        return <div className="p-6 text-center text-gray-500">Carregando detalhes do agente...</div>;
    }

    const activeM0Clients = m0Clients.filter(c => c.status === 'active');
    const totalM1Transacted = m1Clients.reduce((sum, client) => sum + (client.currentTPV || 0), 0);

    // Lógica de Projeção
    const today = new Date();
    const refDate = new Date(`${currentMonth}-02T00:00:00`);
    
    const isCurrentMonthView = today.getFullYear() === refDate.getFullYear() && today.getMonth() === refDate.getMonth();
    const daysPassed = isCurrentMonthView ? today.getDate() : 0;
    const daysInMonth = isCurrentMonthView ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : 0;

    const totalDailyAverage = (daysPassed > 0) ? totalM1Transacted / daysPassed : 0;
    const totalProjection = totalDailyAverage * daysInMonth;

    return (
        <div className="bg-gray-50 p-4 border-t-2 border-green-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Seção de Novos Ativos (M0) */}
                <div>
                    <h4 className="font-bold text-md text-gray-700 mb-2">Novos Ativos ({currentMonth.split('-').reverse().join('/')})</h4>
                    {activeM0Clients.length > 0 ? (
                        <ul className="list-disc list-inside bg-white p-3 rounded-md border text-sm space-y-1">
                            {activeM0Clients.map((client, index) => (
                                <li key={index} className="text-gray-800">{client.name}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 italic">Nenhum cliente ativado neste período.</p>
                    )}
                </div>

                {/* Seção da Carteira M1 */}
                <div>
                    <h4 className="font-bold text-md text-gray-700 mb-2">Análise da Carteira M1</h4>
                    {m1Clients.length > 0 ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div className="bg-white p-3 rounded-md border">
                                    <p className="text-sm font-medium text-gray-500">TPV Transacionado Atual</p>
                                    <p className="text-xl font-bold text-blue-600">{formatCurrency(totalM1Transacted)}</p>
                                </div>
                                <div className="bg-white p-3 rounded-md border">
                                    <p className="text-sm font-medium text-gray-500">Projeção de TPV Total</p>
                                    <p className={`text-xl font-bold ${totalProjection > 0 ? 'text-green-600' : 'text-gray-500'}`}>{formatCurrency(totalProjection)}</p>
                                </div>
                            </div>
                         
                            <div className="overflow-x-auto bg-white rounded-md border">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="p-2 text-left font-medium text-gray-600">Cliente M1</th>
                                            <th className="p-2 text-left font-medium text-gray-600">TPV Acordado</th>
                                            <th className="p-2 text-left font-medium text-gray-600">TPV Transacionado</th>
                                            <th className="p-2 text-left font-medium text-gray-600">Projeção TPV</th>
                                            <th className="p-2 text-left font-medium text-gray-600">Migração Indiv.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {m1Clients.map((client, index) => {
                                            const individualMigration = client.agreedTPV > 0 ? ((client.currentTPV || 0) / client.agreedTPV) * 100 : 0;
                                            const clientProjection = (daysPassed > 0) ? ((client.currentTPV || 0) / daysPassed) * daysInMonth : 0;
                                            
                                            return (
                                                <tr key={index}>
                                                    <td className="p-2 text-gray-800">{client.name}</td>
                                                    <td className="p-2 text-gray-500">{formatCurrency(client.agreedTPV || 0)}</td>
                                                    <td className="p-2 text-gray-800">{formatCurrency(client.currentTPV || 0)}</td>
                                                    <td className="p-2 text-gray-800 font-medium">{formatCurrency(clientProjection)}</td>
                                                    <td className={`p-2 font-semibold ${individualMigration >= 70 ? 'text-green-600' : 'text-orange-500'}`}>
                                                        {individualMigration.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                         <p className="text-sm text-gray-500 italic">Nenhuma carteira M1 para analisar.</p>
                    )}
                </div>
            </div>
        </div>
    );
}