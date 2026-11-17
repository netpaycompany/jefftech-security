import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(extensionDir, "..");

function manifestPlugin(supabaseOrigin: string): Plugin {
  return {
    name: "jefftech-extension-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify({
          manifest_version: 3,
          name: "Jefftech Security",
          short_name: "Jefftech",
          description: "Secure access to your Jefftech encrypted password vault.",
          version: "0.1.0",
          minimum_chrome_version: "120",
          permissions: ["identity", "storage", "scripting", "activeTab", "clipboardRead", "clipboardWrite"],
          host_permissions: [`${supabaseOrigin}/*`],
          optional_host_permissions: ["https://*/*"],
          background: { service_worker: "background.js", type: "module" },
          action: { default_title: "Jefftech Security", default_popup: "popup.html" },
          content_security_policy: {
            extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
          },
        }, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, ["NEXT_PUBLIC_"]);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!supabaseUrl || !supabasePublishableKey || !appUrl) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and NEXT_PUBLIC_APP_URL before building.");
  }
  const supabase = new URL(supabaseUrl);
  const app = new URL(appUrl);
  const isLoopback = app.hostname === "localhost" || app.hostname === "127.0.0.1" || app.hostname === "[::1]";
  if (supabase.protocol !== "https:" || supabase.username || supabase.password || supabase.pathname !== "/"
    || supabase.search || supabase.hash
    || (app.protocol !== "https:" && !(mode !== "production" && app.protocol === "http:" && isLoopback))) {
    throw new Error("The Supabase URL and production Jefftech website URL must use HTTPS. HTTP is allowed only for a local development server.");
  }

  return {
    root: extensionDir,
    envDir: projectRoot,
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [react(), tailwindcss(), manifestPlugin(supabase.origin)],
    define: {
      __JEFFTECH_APP_URL__: JSON.stringify(app.origin),
    },
    build: {
      outDir: path.join(extensionDir, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.join(extensionDir, "popup.html"),
          background: path.join(extensionDir, "src", "background", "index.ts"),
          content: path.join(extensionDir, "src", "content", "index.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      clearMocks: true,
    },
  };
});
