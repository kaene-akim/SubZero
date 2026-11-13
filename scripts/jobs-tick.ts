import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { runTick } from "../src/lib/jobs/runner";

async function main() {
  const summary = await runTick("script");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
