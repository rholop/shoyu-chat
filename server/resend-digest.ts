import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../.env') });

import { sendWeeklyDigest } from './src/jobs/weeklyDigest';

// Find the most recent Sunday — that's when the last digest was generated
function lastSunday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 7 : d.getDay()));
  d.setHours(23, 59, 0, 0);
  return d;
}

const date = lastSunday();
console.log(`Resending digest for week of ${date.toDateString()}...`);

sendWeeklyDigest(date)
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to resend digest:', err);
    process.exit(1);
  });
