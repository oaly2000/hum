import { readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { Creem } from "creem";

// Explicit provisioning only: the running store never reads CLI credentials.
const envFile = new URL("../.env.local", import.meta.url);
let source = "";
try {
  source = await readFile(envFile, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const env = { ...process.env, ...parseEnv(source) };
if (!env.CREEM_API_KEY && process.argv.includes("--from-cli")) {
  const config = JSON.parse(
    await readFile(join(homedir(), ".creem", "config.json"), "utf8"),
  );
  env.CREEM_API_KEY = config.api_key;
}
if (!env.CREEM_API_KEY?.startsWith("creem_test_"))
  throw new Error(
    "Provide a Creem test key through CREEM_API_KEY or pass --from-cli after creem login.",
  );
env.STORE_ORIGIN ||= "http://localhost:3001";
env.STORE_DATABASE ||= ".data/store.sqlite";
env.PORT ||= "3001";
env.BETTER_AUTH_SECRET ||= randomBytes(32).toString("hex");
const sdk = new Creem({
  apiKey: env.CREEM_API_KEY,
  server: "test",
  timeoutMs: 20000,
});
const keys = [
  "STORE_ORIGIN",
  "STORE_DATABASE",
  "PORT",
  "BETTER_AUTH_SECRET",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_ID",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_TEMPLATE_PRODUCT_ID",
  "CREEM_COMPONENTS_PRODUCT_ID",
  "CREEM_GUIDE_PRODUCT_ID",
];
async function save() {
  const lines = source
    .split(/\r?\n/)
    .filter((line) => !keys.some((key) => line.startsWith(`${key}=`)));
  while (lines.at(-1) === "") lines.pop();
  await writeFile(
    envFile,
    [
      ...lines,
      ...keys
        .filter((key) => env[key])
        .map((key) => `${key}=${JSON.stringify(env[key])}`),
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(envFile, 0o600);
}
await save();
try {
  const definitions = [
    [
      "CREEM_TEMPLATE_PRODUCT_ID",
      "Launch Kit",
      "A sample digital launch checklist and Hum page pattern.",
      2900,
    ],
    [
      "CREEM_COMPONENTS_PRODUCT_ID",
      "Interface Notes",
      "A sample guide to semantic, progressively enhanced interfaces.",
      1900,
    ],
    [
      "CREEM_GUIDE_PRODUCT_ID",
      "The Slower Web",
      "A sample field guide to server rendering and islands.",
      900,
    ],
  ];
  for (const [key, name, description, price] of definitions) {
    if (!env[key]) {
      // Recover an earlier provisioning run that completed remotely before saving locally.
      let found;
      for (let page = 1; page <= 20; page++) {
        const result = (await sdk.products.search(page, 100)).result;
        found = result.items.find(
          (p) =>
            p.name === name &&
            p.description === description &&
            p.price === price &&
            p.currency === "USD" &&
            p.status === "active",
        );
        if (found || !result.pagination.nextPage) break;
      }
      const product =
        found ??
        (await sdk.products.create({
          name,
          description,
          price,
          currency: "USD",
          billingType: "onetime",
          taxMode: "exclusive",
          taxCategory: "digital-goods-service",
        }));
      env[key] = product.id;
      await save();
      console.log(
        `${name}: ${found ? "reused" : "created"} test product ${product.id}`,
      );
    }
  }
  if (!env.CREEM_WEBHOOK_ID) {
    const webhook = await sdk.webhooks.create({
      name: "Hum Store local development",
      deliveryMode: "cli",
      events: ["checkout.completed", "refund.created", "dispute.created"],
    });
    env.CREEM_WEBHOOK_ID = webhook.id;
    env.CREEM_WEBHOOK_SECRET = webhook.secret;
    await save();
  }
  console.log(
    "Test configuration saved to packages/store/.env.local (credentials omitted).",
  );
  console.log(
    `Forward local payment events in a second terminal:\ncreem listen --environment test --webhook ${env.CREEM_WEBHOOK_ID} --forward-to ${env.STORE_ORIGIN}/api/webhooks/creem`,
  );
} catch (error) {
  console.error(
    `Creem test provisioning failed (${error.name}${typeof error.statusCode === "number" ? `, HTTP ${error.statusCode}` : ""}). Saved progress can be retried safely.`,
  );
  process.exitCode = 1;
}
