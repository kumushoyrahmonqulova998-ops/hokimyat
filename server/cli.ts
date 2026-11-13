import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getDb, seedHistoricalPf193Data } from './db.ts';
import { hashPassword } from './security.ts';
import { toTashkentParts } from './config.ts';

async function main() {
  const command = process.argv[2] || 'help';
  const db = getDb();

  if (command === 'create-superadmin') {
    const rl = readline.createInterface({ input, output });
    const username = (await rl.question('Super Admin logini (masalan, hokim_admin): ')).trim().toLowerCase();
    const fullName = (await rl.question("F.I.Sh: ")).trim();
    const password = (await rl.question('Parol (kamida 8 belgi): ')).trim();
    rl.close();

    if (!/^[a-z0-9._-]{4,32}$/.test(username) || password.length < 8) {
      console.error("Xato: Login >= 4 ta belgi va parol >= 8 ta belgi bo'lishi shart.");
      process.exit(1);
    }

    const role = db.prepare(`SELECT id FROM roles WHERE slug = 'super_admin'`).get() as { id: number };
    const nowIso = toTashkentParts().iso;
    db.prepare(
      `INSERT INTO users (username, full_name, password_hash, role_id, is_active, is_blocked, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?)`
    ).run(username, fullName || 'Super Admin', hashPassword(password), role.id, nowIso, nowIso);

    console.log(`Super Admin "${username}" muvaffaqiyatli yaratildi.`);
    process.exit(0);
  }

  if (command === 'seed-history') {
    const res = seedHistoricalPf193Data(db, null);
    console.log(`Tarixiy ma'lumotlar yuklandi: ${res.seededRows} ta yozuv.`);
    process.exit(0);
  }

  console.log('Foydalanish: npx tsx server/cli.ts [create-superadmin | seed-history]');
}

main();
