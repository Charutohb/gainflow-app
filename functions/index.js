// Caminho: functions/index.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "us-central1" });

exports.fecharMesAgente = onCall(async (request) => {
  // 1. VERIFICAÇÃO DE SEGURANÇA
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Você precisa estar autenticado.");
  }

  const franqueadoId = request.auth.uid;
  const userDocRef = db.doc(`users/${franqueadoId}`);
  let userProfile;
  try {
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {
      throw new HttpsError('not-found', 'Perfil do franqueado não encontrado.');
    }
    userProfile = userDocSnap.data();
  } catch (err) {
    throw new HttpsError('internal', 'Erro ao verificar permissões.');
  }

  if (userProfile.perfil !== "franqueado") {
    throw new HttpsError("permission-denied", "Ação permitida apenas para franqueados.");
  }
  
  const franchiseId = userProfile.idFranquia;
  const { agentId, periodo } = request.data; 
  if (!agentId || !periodo) {
    throw new HttpsError("invalid-argument", "Argumentos inválidos (agentId, periodo).");
  }

  console.log(`Iniciando fechamento para: Agente ${agentId}, Período ${periodo}, Franquia ${franchiseId}`);

  try {
    // 2. BUSCAR TODOS OS DADOS DO BANCO
    const date = new Date(`${periodo}-02T00:00:00`);
    const currentMonth = date.toISOString().slice(0, 7); // M0
    date.setMonth(date.getMonth() - 1);
    const previousMonth = date.toISOString().slice(0, 7); // M1

    const franchiseDoc = await db.doc(`franquias/${franchiseId}`).get();
    const franchiseData = franchiseDoc.data();
    const { kpis, regrasRV } = franchiseData;

    const planDocRef = db.doc(`franquias/${franchiseId}/planos/${periodo}`); // --- Referência movida para cima
    const planDoc = await planDocRef.get(); // --- Lendo o doc aqui
    
    if (!franchiseDoc.exists || !planDoc.exists) {
        throw new HttpsError("not-found", "Dados do plano ou franquia não encontrados.");
    }

    const agentPlan = planDoc.data().agents.find((a) => a.id === agentId);
    if (!agentPlan) {
        throw new HttpsError("not-found", "Agente não encontrado no plano deste mês.");
    }

    const m0Query = db.collection("clientes").where("agentId", "==", agentId).where("monthAdded", "==", currentMonth);
    const m1Query = db.collection("clientes").where("agentId", "==", agentId).where("monthAdded", "==", previousMonth).where("status", "==", "active");

    const [m0Snapshot, m1Snapshot] = await Promise.all([m0Query.get(), m1Query.get()]);
    const m0Clients = m0Snapshot.docs.map((doc) => doc.data());
    const m1Clients = m1Snapshot.docs.map((doc) => doc.data());

    // 3. RECALCULAR A RV (Lógica idêntica, apenas para segurança)
    const totalNovosAtivos = m0Clients.filter((c) => c.status === "active").length;
    const totalTpvTransacionado = m1Clients.reduce((sum, c) => sum + (c.currentTPV || 0), 0);
    const totalTpvAcordado = m1Clients.reduce((sum, c) => sum + (c.agreedTPV || 0), 0);
    
    const individualSuccessTrigger = regrasRV.triggers?.migracao_individual || 70;
    const successfulMigratorsCount = m1Clients.filter((c) => {
        if (c.agreedTPV <= 0) return false;
        return ((c.currentTPV || 0) / c.agreedTPV) * 100 >= individualSuccessTrigger;
    }).length;
    
    const migracaoDisplayPercent = m1Clients.length > 0 ? (successfulMigratorsCount / m1Clients.length) * 100 : 0;
    
    let rvFinalTotal = 0; 
    
    const { rvReference, goals } = agentPlan;
    const safeGoals = goals || {};
    const weights = regrasRV.weights || {};
    const triggers = regrasRV.triggers || {};
    const caps = regrasRV.caps || {};

    kpis.forEach((kpi) => {
        const kpiId = kpi.id;
        const goal = safeGoals[kpi.id] || 0;
        const kpiTrigger = triggers[kpiId] || 0;
        const kpiCap = caps[kpiId] || 100;

        let finalPercentForRV = 0;
        let percentualParaCalculoDeRV = 0;
        let valorParaChecarGatilho = 0;
        let realizadoValue = 0; 

        if (kpi.name.toLowerCase().includes("novos ativos")) {
            realizadoValue = totalNovosAtivos;
            percentualParaCalculoDeRV = goal > 0 ? (realizadoValue / goal) * 100 : 0;
            valorParaChecarGatilho = percentualParaCalculoDeRV;
        } else if (kpi.name.toLowerCase().includes("tpv transacionado")) {
            realizadoValue = totalTpvTransacionado;
            percentualParaCalculoDeRV = goal > 0 ? (realizadoValue / goal) * 100 : 0;
            valorParaChecarGatilho = percentualParaCalculoDeRV;
        } else if (kpi.name.toLowerCase().includes("migração")) {
            realizadoValue = migracaoDisplayPercent;
            percentualParaCalculoDeRV = goal > 0 ? (realizadoValue / goal) * 100 : 0; 
            valorParaChecarGatilho = realizadoValue;
        }

        if (valorParaChecarGatilho >= kpiTrigger) {
            finalPercentForRV = Math.min(percentualParaCalculoDeRV, kpiCap);
        }
        
        const rvValue = (rvReference * (weights[kpiId] / 100)) * (finalPercentForRV / 100);
        rvFinalTotal += rvValue;
    });

    // 4. ATUALIZAR O DOCUMENTO DO PLANO (LÓGICA DE TRANSAÇÃO REMOVIDA PARA SIMPLICIDADE)
    // A transação não é estritamente necessária se você está apenas atualizando o plano.
    
    const planData = planDoc.data();
    const updatedAgents = planData.agents.map((agent) => {
        if (agent.id === agentId) {
            return { 
                ...agent, 
                statusFechamento: "fechado", 
                comentarioRevisao: "",
                rvFinal: rvFinalTotal // <-- O campo é adicionado aqui
            };
        }
        return agent;
    });

    // Atualiza o documento do plano com o novo array de agentes
    await planDocRef.update({ agents: updatedAgents });

    console.log(`Fechamento concluído com sucesso para ${agentId} no período ${periodo}.`);
    return { status: "success", message: "Mês fechado com sucesso!" };

  } catch (error) {
    console.error("Erro ao fechar o mês:", error);
    if (error instanceof HttpsError) {
        throw error;
    }
    throw new HttpsError("internal", "Erro ao processar o fechamento.", error.message);
  }
});