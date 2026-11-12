import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const pagesBase = process.env.PAGES_BASE || "/";

function pagesExtras() {
  return {
    name: "pages-extras",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      const index = resolve(dist, "index.html");
      if (existsSync(index)) {
        copyFileSync(index, resolve(dist, "404.html"));
      }
      writeFileSync(resolve(dist, ".nojekyll"), "");
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/PretendardVariable.woff2", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "icons/icon.svg"],
      manifest: {
        name: "축의금 로그",
        short_name: "축의금 로그",
        description: "경조사 축의금·부의금 접수 기록",
        lang: "ko",
        theme_color: "#111111",
        background_color: "#f3f3f1",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        categories: ["productivity", "utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
    pagesExtras(),
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
