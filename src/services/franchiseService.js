// src/services/franchiseService.js

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // Verifique se este caminho está correto

export const setupFranchiseRules = async (franchiseId, kpis) => {
  if (!franchiseId || !Array.isArray(kpis)) {
    alert("Erro: ID da Franquia e lista de KPIs são obrigatórios.");
    return;
  }

  try {
    const franchiseDocRef = doc(db, "franquias", franchiseId);
    const newRules = {
      weights: {},
      triggers: {},
      caps: {}
    };

    kpis.forEach(kpi => {
      newRules.weights[kpi.id] = 0;
      newRules.triggers[kpi.id] = 80;
      newRules.caps[kpi.id] = 120;
    });

    const dataToSave = {
      kpis: kpis,
      regrasRV: newRules
    };

    await setDoc(franchiseDocRef, dataToSave, { merge: true });

    alert(`Franquia '${franchiseId}' configurada com sucesso! A página será recarregada.`);

  } catch (error) {
    alert("Ocorreu um erro ao configurar a franquia. Veja o console.");
    console.error("Erro ao configurar as regras da franquia:", error);
  }
};