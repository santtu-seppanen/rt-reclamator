import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import type { RuntimeCaching } from "workbox-build";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiUrl = env.VITE_API_URL;

  // Ilman käyttökelpoista Worker-URL:ia (esim. build ilman .env.local:ia)
  // jätetään runtime-caching-säännöt pois sen sijaan, että kaadetaan build.
  let runtimeCaching: RuntimeCaching[] = [];
  try {
    if (apiUrl) {
      const apiOrigin = new URL(apiUrl).origin;
      runtimeCaching = [
        {
          urlPattern: new RegExp(`^${apiOrigin}/analyysit$`),
          handler: "NetworkFirst",
          options: {
            cacheName: "rt-reclamator-data",
            networkTimeoutSeconds: 4,
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
          },
        },
        {
          urlPattern: new RegExp(`^${apiOrigin}/kuvat/`),
          handler: "CacheFirst",
          options: {
            cacheName: "rt-reclamator-kuvat",
            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
      ];
    }
  } catch {
    runtimeCaching = [];
  }

  return {
    base: "/rt-reclamator/",
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          runtimeCaching,
        },
        manifest: {
          name: "RT Reclamator",
          short_name: "RT Reclamator",
          description: "Kuvaa remonttikohde ja saa ehdotukset sopivista RT-korteista.",
          start_url: "/rt-reclamator/",
          scope: "/rt-reclamator/",
          display: "standalone",
          theme_color: "#d9720c",
          background_color: "#eef1f4",
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          ],
        },
      }),
    ],
  };
});
