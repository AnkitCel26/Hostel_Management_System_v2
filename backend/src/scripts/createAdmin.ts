import 'reflect-metadata';
import { AppDataSource } from '../config/db';
import { User, UserRole } from '../entities/user.entity';
import { hashPassword } from '../utils/password';

async function main(): Promise<void> {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run seed:admin -- <email> <password> [name]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(User);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await repo.findOne({ where: { email: normalizedEmail } });

    if (existing) {
      existing.role = UserRole.Admin;
      existing.name = name?.trim() || existing.name;
      existing.password = await hashPassword(password);
      const saved = await repo.save(existing);
      console.log(`Admin user updated: ${saved.email}`);
    } else {
      const admin = await repo.save(
        repo.create({
          name: name?.trim() || 'Administrator',
          email: normalizedEmail,
          password: await hashPassword(password),
          role: UserRole.Admin
        })
      );
      console.log(`Admin user created: ${admin.email}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Failed to seed admin user:', error);
  process.exit(1);
});
