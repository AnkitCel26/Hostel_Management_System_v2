import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';
import { Room } from './room.entity';
import { Tenant } from './tenant.entity';
import { Complaint } from './complaint.entity';
import { Announcement } from './announcement.entity';

@Entity('pgs')
export class Pg {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Pg 1 ─ * Room
  @OneToMany(() => Room, (room) => room.pg)
  rooms?: Room[];

  // Tenant * ─ 1 Pg
  @OneToMany(() => Tenant, (tenant) => tenant.pg)
  tenants?: Tenant[];

  // Pg 1 ─ * Complaint
  @OneToMany(() => Complaint, (complaint) => complaint.pg)
  complaints?: Complaint[];

  // Pg 1 ─ * Announcement
  @OneToMany(() => Announcement, (announcement) => announcement.pg)
  announcements?: Announcement[];
}
