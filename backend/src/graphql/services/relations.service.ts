import { AppDataSource } from '../../config/db';
import { Announcement } from '../../entities/announcement.entity';
import { Complaint } from '../../entities/complaint.entity';
import { RentPayment } from '../../entities/rent_payment.entity';
import { Room } from '../../entities/room.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantDocument } from '../../entities/tenant_docs.entity';
import { User } from '../../entities/user.entity';

export async function roomsForPg(pgId: string): Promise<Room[]> {
  return AppDataSource.getRepository(Room).find({
    where: { pg: { id: pgId } },
    order: { roomNumber: 'ASC', createdAt: 'ASC' },
    relations: { pg: true }
  });
}

export async function tenantsForPg(pgId: string): Promise<Tenant[]> {
  return AppDataSource.getRepository(Tenant).find({
    where: { pg: { id: pgId } },
    order: { createdAt: 'ASC' },
    relations: { user: true, pg: true, room: true }
  });
}

export async function complaintsForPg(pgId: string): Promise<Complaint[]> {
  return AppDataSource.getRepository(Complaint).find({
    where: { pg: { id: pgId } },
    order: { createdAt: 'DESC' },
    relations: { tenant: true, pg: true }
  });
}

export async function announcementsForPg(pgId: string): Promise<Announcement[]> {
  return AppDataSource.getRepository(Announcement).find({
    where: { pg: { id: pgId } },
    order: { createdAt: 'DESC' },
    relations: { pg: true, createdBy: true }
  });
}

export async function tenantsForRoom(roomId: string): Promise<Tenant[]> {
  return AppDataSource.getRepository(Tenant).find({
    where: { room: { id: roomId } },
    order: { createdAt: 'ASC' },
    relations: { user: true, pg: true, room: true }
  });
}

export async function documentsForTenant(tenantId: string): Promise<TenantDocument[]> {
  return AppDataSource.getRepository(TenantDocument).find({
    where: { tenant: { id: tenantId } },
    order: { createdAt: 'DESC' },
    relations: { tenant: true }
  });
}

export async function paymentsForTenant(tenantId: string): Promise<RentPayment[]> {
  return AppDataSource.getRepository(RentPayment).find({
    where: { tenant: { id: tenantId } },
    order: { dueDate: 'DESC', createdAt: 'DESC' },
    relations: { tenant: true }
  });
}

export async function complaintsForTenant(tenantId: string): Promise<Complaint[]> {
  return AppDataSource.getRepository(Complaint).find({
    where: { tenant: { id: tenantId } },
    order: { createdAt: 'DESC' },
    relations: { tenant: true, pg: true }
  });
}

export async function roomWithRelations(roomId: string): Promise<Room | null> {
  return AppDataSource.getRepository(Room).findOne({
    where: { id: roomId },
    relations: { pg: true }
  });
}

export async function tenantWithRelations(tenantId: string): Promise<Tenant | null> {
  return AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId },
    relations: { user: true, pg: true, room: true }
  });
}

export async function complaintWithRelations(complaintId: string): Promise<Complaint | null> {
  return AppDataSource.getRepository(Complaint).findOne({
    where: { id: complaintId },
    relations: { tenant: true, pg: true }
  });
}

export async function announcementWithRelations(
  announcementId: string
): Promise<Announcement | null> {
  return AppDataSource.getRepository(Announcement).findOne({
    where: { id: announcementId },
    relations: { pg: true, createdBy: true }
  });
}

export async function documentWithRelations(documentId: string): Promise<TenantDocument | null> {
  return AppDataSource.getRepository(TenantDocument).findOne({
    where: { id: documentId },
    relations: { tenant: true }
  });
}

export async function paymentWithRelations(paymentId: string): Promise<RentPayment | null> {
  return AppDataSource.getRepository(RentPayment).findOne({
    where: { id: paymentId },
    relations: { tenant: true }
  });
}

export async function userWithRelations(userId: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    relations: { tenant: true }
  });
}
