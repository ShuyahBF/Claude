// Petit « service worker » de Paiement Mobile (lot 40) : il sert UNIQUEMENT à afficher les notifications
// (sur téléphone Android, Chrome n'accepte les notifications que par ce biais) et à ouvrir la bonne page au toucher.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Notification « push » envoyée par le serveur (application fermée) : le contenu est déjà déchiffré par le navigateur.
// Même « tag » (la clé de l'événement) que les alertes de l'écran : jamais deux bandeaux pour le même événement.
self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { titre: "Paiement Mobile", texte: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(m.titre || "Paiement Mobile", {
    body: m.texte || "", icon: "/icone.svg", badge: "/icone.svg", tag: m.cle, renotify: true, data: { lien: m.lien || "/" },
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
