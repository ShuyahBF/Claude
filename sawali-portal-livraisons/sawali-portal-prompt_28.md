# Sawali — Lot 28 : zone de saisie de la conversation en pleine largeur

**Interdiction explicite** : je ne veux AUCUNE commande de test, de build ou
de lint, pas de ré-analyse du code, et surtout **AUCUN Testing Agent, agent
évaluateur ou analyseur automatique**. Tu appliques et tu déploies directement.

Applique `sawali-portal-corrections_28_8fbeb16.patch` sur la branche
`conflict_230926_1008`. Base attendue : ton commit `ce753a0` (« Auto-generated
changes », juste après `47e17b9`, le lot 27 que tu as publié). Le patch ne
touche pas au dossier `.emergent`. C'est un `git format-patch` d'un seul
commit. Dans cet ordre :

1. applique-le en UN SEUL `git am` ;
2. enregistre sur GitHub (« Save to GitHub ») ;
3. redéploie (frontend, bouton Deploy compris).

## Fichier touché

- `frontend/src/pages/portal/Contacts.jsx` (fenêtre « Conversation » du
  Centre de Messagerie)

Aucun changement backend, aucune dépendance nouvelle, aucune variable
d'environnement nouvelle, aucune donnée modifiée.

## Ce que ça apporte

Dans la fenêtre « Conversation », les cinq boutons (joindre un fichier,
partager, note vocale, presse-papiers, emojis) étaient sur la même ligne que
la zone de saisie et l'écrasaient : il ne restait presque plus de place pour
écrire.

- Les boutons passent **au-dessus** de la zone de saisie, avec le compteur
  « x / 4096 » à droite.
- La zone de texte prend **toute la largeur**, affiche 3 lignes par défaut et
  peut être agrandie à la souris (coin en bas à droite).
- Le bouton « Envoyer » reste à droite de la zone de saisie.
- Rien d'autre ne change : raccourci Ctrl+Entrée, Ctrl+V pour coller une
  image, emojis insérés à la position du curseur, annotation d'image.

## À tester une fois déployé

1. Centre de Messagerie → ouvre la conversation d'un contact qui t'a écrit
   il y a moins de 24 h.
2. Les boutons sont sur une ligne au-dessus de la zone de saisie ; la zone de
   texte occupe toute la largeur jusqu'au bouton « Envoyer ».
3. Écris un long message : il s'affiche sur plusieurs lignes, le compteur
   augmente ; Ctrl+Entrée envoie.
4. Clique sur 😊 et insère un emoji : il arrive à la position du curseur.

Si quelque chose ne marche pas, renvoie-moi le message d'erreur exact.
Rappel : **AUCUN test, build, lint, Testing Agent ou analyse automatique**.
Applique le patch en UN SEUL `git am`, enregistre sur GitHub, puis déploie.
