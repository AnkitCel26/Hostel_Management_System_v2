import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity';
import { Pg } from './pg.entity';
import { Room } from './room.entity';
import { TenantDocument } from './tenant_docs.entity';
import { RentPayment } from './rent_payment.entity';
import { Complaint } from './complaint.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  emergencyContact?: string | null;

  @Column({ type: 'date', nullable: true })
  joinDate?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // User 1 ─ 0..1 Tenant (Tenant owns the FK, exactly one user per tenant)
  @OneToOne(() => User, (user) => user.tenant, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  // Tenant * ─ 1 Pg
  @ManyToOne(() => Pg, (pg) => pg.tenants, { nullable: false })
  pg!: Pg;

  // Tenant * ─ 0..1 Room
  @ManyToOne(() => Room, (room) => room.tenants, { nullable: true })
  room?: Room | null;

  // Tenant 1 ─ * TenantDocument
  @OneToMany(() => TenantDocument, (document) => document.tenant)
  documents?: TenantDocument[];

  // Tenant 1 ─ * RentPayment
  @OneToMany(() => RentPayment, (payment) => payment.tenant)
  payments?: RentPayment[];

  // Tenant 1 ─ * Complaint
  @OneToMany(() => Complaint, (complaint) => complaint.tenant)
  complaints?: Complaint[];
}
