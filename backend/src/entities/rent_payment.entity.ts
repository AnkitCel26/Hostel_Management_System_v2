import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne
} from 'typeorm';
import { Tenant } from './tenant.entity';

// Keep consistent with the GraphQL PaymentStatus enum (MRD §16).
export enum PaymentStatus {
  Pending = 'pending',
  Partial = 'partial',
  Paid = 'paid',
  Overdue = 'overdue'
}

@Entity('rent_payments')
export class RentPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Tenant 1 ─ * RentPayment
  @ManyToOne(() => Tenant, (tenant) => tenant.payments, { nullable: false })
  tenant!: Tenant;

  @Column({ type: 'int', default: 0 })
  amount!: number;

  @Column({ type: 'int', default: 0 })
  paidAmount!: number;

  @Column({ type: 'date' })
  dueDate!: string;

  @Column({ type: 'date', nullable: true })
  paidDate?: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.Pending
  })
  status!: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
