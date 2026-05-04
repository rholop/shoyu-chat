import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../.env') });

import { sendWeeklyDigest } from './src/jobs/weeklyDigest';

console.log('Resending last weekly digest email...');

sendWeeklyDigest()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to resend digest:', err);
    process.exit(1);
  });
