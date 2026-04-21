import 'dotenv/config';
import path from 'path';
import readline from 'readline';
import bcrypt from 'bcrypt';

// Set DATA_DIR before importing db
process.env.DATA_DIR =
  process.env.DATA_DIR ?? path.join(__dirname, '../data');

// Dynamic import after env is set
async function main() {
  const { createUser, getUserByUsername } = await import('../server/src/db');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  const username = (await ask('Username: ')).trim();
  const email = (await ask('Email: ')).trim();

  // Read password without echoing
  process.stdout.write('Password: ');
  const password = await new Promise<string>((resolve) => {
    let pw = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk) => {
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

  if (getUserByUsername(username)) {
    console.error(`User "${username}" already exists.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  createUser(username, hash, email);
  console.log(`User "${username}" created successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
