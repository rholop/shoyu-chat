import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../.env') });
import readline from 'readline';
import bcrypt from 'bcrypt';
import { writeUser, readUser } from './src/storage';

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  const username = (await ask('Username: ')).trim();
  const email = (await ask('Email: ')).trim();

  process.stdout.write('Password: ');
  const password = await new Promise<string>((resolve) => {
    let pw = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk: Buffer) => {
      const ch = chunk.toString();
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(pw);
      } else if (ch === '') {
        process.exit();
      } else if (ch === '') {
        pw = pw.slice(0, -1);
      } else {
        pw += ch;
      }
    });
  });

  rl.close();

  if (readUser()) {
    console.error('A user already exists. Delete data/user.json first to re-seed.');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 12);
  writeUser({
    username,
    password_hash,
    email,
    created_at: new Date().toISOString(),
  });

  console.log(`User "${username}" created at data/user.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
