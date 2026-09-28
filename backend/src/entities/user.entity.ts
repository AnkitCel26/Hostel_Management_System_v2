import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  Index
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Announcement } from './announcement.entity';

export enum UserRole {
  Admin = 'Admin',
  Tenant = 'Tenant'
}

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 160 })
  email!: string;

  // Never expose this through GraphQL responses (FR-34).
  // select:false keeps the hash out of every default query and relation load;
  // the auth service opts in explicitly only to verify it during login.
  @Column({ type: 'varchar', length: 255, select: false })
  password!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.Tenant
  })
  role!: UserRole;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // User 1 ─ 0..1 Tenant (Tenant owns the FK)
  @OneToOne(() => Tenant, (tenant) => tenant.user)
  tenant?: Tenant | null;

  // User 1 ─ * Announcement (creator)
  @OneToMany(() => Announcement, (announcement) => announcement.createdBy)
  announcements?: Announcement[];
}
