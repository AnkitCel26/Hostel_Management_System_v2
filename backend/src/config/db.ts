import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

// Entities/migrations globs work both for ts-node/CLI usage (src/*.ts)
const isCompiled = __filename.endsWith('.js');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Schema changes must go through migrations only (MRD: sync disabled).
  synchronize: false,
  logging: false,
  entities: [isCompiled ? 'dist/entities/*.entity.js' : 'src/entities/*.entity.ts'],
  migrations: [isCompiled ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  migrationsTableName: 'migrations'
});
