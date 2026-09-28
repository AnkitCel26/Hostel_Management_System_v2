import dotenv from 'dotenv';
import { createApp } from './app';
import { AppDataSource } from './config/db';

dotenv.config();

async function main() {
  await AppDataSource.initialize();

  const app = await createApp();
  // Default to 4001: port 4000 is already used by another local app in this environment.
  const port = Number(process.env.PORT ?? 4001);

  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}/graphql`);
  });
}

main().catch((err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
