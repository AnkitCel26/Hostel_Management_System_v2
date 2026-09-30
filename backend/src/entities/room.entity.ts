import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Unique
} from 'typeorm';
import { Pg } from './pg.entity';
import { Tenant } from './tenant.entity';

@Entity('rooms')
@Unique(['pg', 'roomNumber'])
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Room belongs to a PG (Pg 1 ─ * Room)
  @ManyToOne(() => Pg, (pg) => pg.rooms, { nullable: false })
  pg!: Pg;

  @Column({ type: 'varchar', length: 20 })
  roomNumber!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  roomType?: string | null;

  @Column({ type: 'int', default: 1 })
  capacity!: number;

  // Occupancy tracking (kept consistent with tenant assignments in Phase 5).
  @Column({ type: 'int', default: 0 })
  occupiedCount!: number;

  @Column({ type: 'int', default: 0 })
  rent!: number;

  @Column({ type: 'int', nullable: true })
  floor?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Tenant, (tenant) => tenant.room)
  tenants?: Tenant[];
}
