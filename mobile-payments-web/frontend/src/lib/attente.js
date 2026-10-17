import { apiClient } from "@/lib/api";

// Lecture d'une donnée que le serveur va chercher EN ARRIÈRE-PLAN (règle 7) : tant qu'il répond « en_cours »,
// on redemande toutes les 1,5 s (4 essais au plus). Renvoie la dernière réponse (peut rester « en_cours »).
export async function lireAvecAttente(url, params, essais = 4) {
  let derniere = { en_cours: true };
  for (let i = 0; i < essais; i += 1) {
    const { data } = await apiClient.get(url, { params });
    derniere = data;
    if (!data.en_cours) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return derniere;
}
