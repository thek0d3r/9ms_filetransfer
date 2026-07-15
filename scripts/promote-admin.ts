import { pool } from "../src/lib/db";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run admin:promote -- owner@example.com");

async function main() {
  const result = await pool.query("update users set role = 'admin' where email = $1 returning id, email", [email]);
  if (!result.rowCount) throw new Error(`No account found for ${email}. Register it first.`);
  console.info(`Promoted ${email} to admin.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
