import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Pg } from './pg.entity';

export enum ComplaintStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved'
}

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Tenant 1 ─ * Complaint
  @ManyToOne(() => Tenant, (tenant) => tenant.complaints, { nullable: false })
  tenant!: Tenant;

  // Pg 1 ─ * Complaint
  @ManyToOne(() => Pg, (pg) => pg.complaints, { nullable: false })
  pg!: Pg;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: ComplaintStatus,
    enumName: 'complaint_status',
    default: ComplaintStatus.Open
  })
  status!: ComplaintStatus;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
