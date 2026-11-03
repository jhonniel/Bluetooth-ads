import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/agent.cjs",
  sourcemap: true,
  legalComments: "none",
  define: { __AGENT_VERSION__: JSON.stringify(pkg.version) },
});

console.log(`Built dist/agent.cjs (agent ${pkg.version})`);
