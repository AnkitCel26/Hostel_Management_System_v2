import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('tenant_documents')
export class TenantDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Tenant 1 ─ * TenantDocument
  @ManyToOne(() => Tenant, (tenant) => tenant.documents, { nullable: false })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 120 })
  docName!: string;

  // Actual file lives in storage (Supabase, Phase 9); DB keeps metadata/URL.
  @Column({ type: 'varchar', length: 500 })
  docUrl!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  docNumber?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
