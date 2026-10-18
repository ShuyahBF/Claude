// Petit « service worker » de auRor (lot 40) : il sert à afficher les notifications
// (sur téléphone Android, Chrome n'accepte les notifications que par ce biais) et à ouvrir la bonne page au toucher.
// Lot 69 (application Android installable) : en plus, quand l'ouverture d'une page échoue faute d'Internet, il affiche
// la page « Pas de connexion » (offline.html) au lieu de l'erreur du navigateur. Rien d'autre n'est mis en cache :
// le site reste toujours à jour (aucune ancienne version servie).
const CACHE_HORS_LIGNE = "pm-hors-ligne-1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_HORS_LIGNE).then((c) => c.add("/offline.html")).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  // Seulement l'ouverture d'une page (navigation) : on essaie le réseau, et en cas d'échec on montre la page hors connexion
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html").then((r) => r || Response.error())));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Notification « push » envoyée par le serveur (application fermée) : le contenu est déjà déchiffré par le navigateur.
// Même « tag » (la clé de l'événement) que les alertes de l'écran : jamais deux bandeaux pour le même événement.
self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { titre: "auRor", texte: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(m.titre || "auRor", {
    body: m.texte || "", icon: "/icone-192.png", badge: "/favicon.png", tag: m.cle, renotify: true, data: { lien: m.lien || "/" },
    // Application fermée : vibration longue et notification qui reste affichée jusqu'au toucher (malvoyants, téléphone dans le sac)
    vibrate: [600, 200, 600, 200, 1000], requireInteraction: true,
  }));
});

// Toucher une notification : on ramène l'application au premier plan sur la page concernée (ou on l'ouvre)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = (event.notification.data && event.notification.data.lien) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ("focus" in f) { if ("navigate" in f) f.navigate(lien); return f.focus(); }
      }
      return self.clients.openWindow(lien);
    }),
  );
});
