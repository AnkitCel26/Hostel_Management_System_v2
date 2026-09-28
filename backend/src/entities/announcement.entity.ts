import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne
} from 'typeorm';
import { Pg } from './pg.entity';
import { User } from './user.entity';

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Pg 1 ─ * Announcement
  @ManyToOne(() => Pg, (pg) => pg.announcements, { nullable: false })
  pg!: Pg;

  // User 1 ─ * Announcement (creator)
  @ManyToOne(() => User, (user) => user.announcements, { nullable: false })
  createdBy!: User;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
