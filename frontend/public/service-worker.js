/* eslint-disable no-restricted-globals */

// Service worker dedicado a notificacoes. Nao faz cache de assets: o build do
// CRA ja versiona os arquivos e um cache aqui so atrapalharia o deploy.

const DEFAULT_ICON = "/branding/icon.png";

self.addEventListener("install", () => {
  // Assume o controle sem esperar as abas antigas fecharem, senao uma versao
  // nova do worker so passaria a valer no proximo dia de uso.
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { body: event.data.text() };
  }

  const title = payload.title || "Espaço Whats";
  const options = {
    body: payload.body || "",
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_ICON,
    data: { url: payload.url || "/" }
  };

  // renotify sem tag lanca TypeError, entao os dois andam juntos: com tag, a
  // notificacao nova substitui a anterior do mesmo ticket em vez de empilhar.
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) {
          continue;
        }
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
