import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev only: `POST /__shot?name=x` with a PNG body writes `shots/x.png` at the repository's root
 * (gitignored), so frames at the fixed viewpoints can be compared at full resolution (`__game.shot`).
 */
const shots = (): Plugin => ({
  name: "shots",
  apply: "serve",
  configureServer(server) {
    const dir = fileURLToPath(new URL("../../shots/", import.meta.url));
    server.middlewares.use("/__shot", (req, res) => {
      const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
      if (req.method !== "POST" || !/^[\w-]{1,64}$/.test(name)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const parts: Buffer[] = [];
      req.on("data", (c: Buffer) => parts.push(c));
      req.on("end", () => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}${name}.png`, Buffer.concat(parts));
        res.end("ok");
      });
    });
  },
});

export default defineConfig({
  // relative asset paths: the same build works at a domain root and under a subpath
  base: "./",
  plugins: [react(), tailwindcss(), shots()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { target: "es2023", chunkSizeWarningLimit: 2000 },
  worker: { format: "es" },
});
