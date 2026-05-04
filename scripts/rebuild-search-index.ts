import { rebuildIndexInternal } from '../server/src/routes/search';

async function main() {
  try {
    await rebuildIndexInternal();
    process.exit(0);
  } catch (err) {
    console.error('Failed to rebuild index:', err);
    process.exit(1);
  }
}

main();
