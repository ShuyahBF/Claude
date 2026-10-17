// Petit « service worker » de Paiement Mobile (lot 40) : il sert UNIQUEMENT à afficher les notifications
// (sur téléphone Android, Chrome n'accepte les notifications que par ce biais) et à ouvrir la bonne page au toucher.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
