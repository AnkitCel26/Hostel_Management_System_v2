import 'reflect-metadata';
import { AppDataSource } from '../config/db';
import { Announcement } from '../entities/announcement.entity';
import { Complaint, ComplaintStatus } from '../entities/complaint.entity';
import { Pg } from '../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../entities/rent_payment.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { TenantDocument } from '../entities/tenant_docs.entity';
import { User, UserRole } from '../entities/user.entity';

const TEST_EMAIL = 'phase2.verify@hostel.test';
const TEST_PG_NAME = 'Phase2 Verify PG';

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
  console.log(`PASS: ${label}`);
}

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);
  const docRepo = AppDataSource.getRepository(TenantDocument);
  const paymentRepo = AppDataSource.getRepository(RentPayment);
  const complaintRepo = AppDataSource.getRepository(Complaint);
  const announcementRepo = AppDataSource.getRepository(Announcement);

  const user = await userRepo.findOne({ where: { email: TEST_EMAIL } });
  const pg = await pgRepo.findOne({ where: { name: TEST_PG_NAME } });

  if (user) {
    const tenant = await tenantRepo.findOne({ where: { user: { id: user.id } } });
    if (tenant) {
      const complaintIds = (
        await complaintRepo.find({ where: { tenant: { id: tenant.id } } })
      ).map((c) => c.id);
      await complaintRepo.delete(complaintIds);

      const paymentIds = (
        await paymentRepo.find({ where: { tenant: { id: tenant.id } } })
      ).map((p) => p.id);
      await paymentRepo.delete(paymentIds);

      const docIds = (
        await docRepo.find({ where: { tenant: { id: tenant.id } } })
      ).map((d) => d.id);
      await docRepo.delete(docIds);

      await tenantRepo.delete(tenant.id);
    }

    const announcementIds = (
      await announcementRepo.find({ where: { createdBy: { id: user.id } } })
    ).map((a) => a.id);
    await announcementRepo.delete(announcementIds);
  }

  if (pg) {
    const roomIds = (await roomRepo.find({ where: { pg: { id: pg.id } } })).map((r) => r.id);
    await roomRepo.delete(roomIds);
    await pgRepo.delete(pg.id);
  }

  if (user) {
    await userRepo.delete(user.id);
  }
}

async function createAndVerify(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const docRepo = AppDataSource.getRepository(TenantDocument);
  const paymentRepo = AppDataSource.getRepository(RentPayment);
  const complaintRepo = AppDataSource.getRepository(Complaint);
  const announcementRepo = AppDataSource.getRepository(Announcement);

  const user = await userRepo.save(
    userRepo.create({
      name: 'Phase Two Verify',
      email: TEST_EMAIL,
      password: 'not-a-real-hash',
      role: UserRole.Admin
    })
  );

  const pg = await pgRepo.save(
    pgRepo.create({
      name: TEST_PG_NAME,
      address: '12 Verify Street',
      city: 'Testville',
      contactNumber: '9800000000'
    })
  );

  const room = await roomRepo.save(
    roomRepo.create({
      pg,
      roomNumber: 'V-101',
      roomType: 'double',
      capacity: 2,
      occupiedCount: 1,
      rent: 5500,
      floor: 1
    })
  );

  const tenant = await tenantRepo.save(
    tenantRepo.create({
      user,
      pg,
      room,
      name: 'Verify Tenant',
      phone: '9811111111',
      emergencyContact: '9822222222',
      joinDate: '2026-09-01'
    })
  );

  const document = await docRepo.save(
    docRepo.create({
      tenant,
      docName: 'ID Proof',
      docUrl: 'https://example.test/docs/id.pdf',
      docNumber: 'ID-0001'
    })
  );

  const payment = await paymentRepo.save(
    paymentRepo.create({
      tenant,
      amount: 5500,
      paidAmount: 2750,
      dueDate: '2026-10-05',
      status: PaymentStatus.Partial,
      notes: 'Half paid this month'
    })
  );

  const complaint = await complaintRepo.save(
    complaintRepo.create({
      tenant,
      pg,
      title: 'Leaking tap',
      description: 'Bathroom tap leaks continuously.',
      status: ComplaintStatus.Open
    })
  );

  const announcement = await announcementRepo.save(
    announcementRepo.create({
      pg,
      createdBy: user,
      title: 'Water maintenance',
      content: 'Water supply paused on Sunday 10am-1pm.'
    })
  );

  const loadedTenant = await tenantRepo.findOne({
    where: { id: tenant.id },
    relations: { user: true, pg: true, room: true }
  });
  if (!loadedTenant) throw new Error('Tenant could not be read back');
  check('tenant -> user (one-to-one owner)', loadedTenant.user.id, user.id);
  check('tenant -> pg (many-to-one)', loadedTenant.pg.id, pg.id);
  check('tenant -> room (many-to-one)', loadedTenant.room?.id, room.id);

  const loadedUser = await userRepo.findOne({
    where: { id: user.id },
    relations: { tenant: true }
  });
  if (!loadedUser) throw new Error('User could not be read back');
  check('user -> tenant (one-to-one inverse)', loadedUser.tenant?.id, tenant.id);
  check('user role persisted', loadedUser.role, UserRole.Admin);

  const loadedRoom = await roomRepo.findOne({
    where: { id: room.id },
    relations: { pg: true, tenants: true }
  });
  if (!loadedRoom) throw new Error('Room could not be read back');
  check('room -> pg (many-to-one)', loadedRoom.pg.id, pg.id);
  const roomTenants = loadedRoom.tenants ?? [];
  check('room -> tenants (one-to-many)', roomTenants.length, 1);
  check('room -> tenant id', roomTenants[0]?.id, tenant.id);
  check('room occupancy value', loadedRoom.occupiedCount, 1);

  const loadedDoc = await docRepo.findOne({
    where: { id: document.id },
    relations: { tenant: true }
  });
  if (!loadedDoc) throw new Error('TenantDocument could not be read back');
  check('document -> tenant', loadedDoc.tenant.id, tenant.id);
  check('document URL persisted', loadedDoc.docUrl, 'https://example.test/docs/id.pdf');

  const loadedPayment = await paymentRepo.findOne({
    where: { id: payment.id },
    relations: { tenant: true }
  });
  if (!loadedPayment) throw new Error('RentPayment could not be read back');
  check('payment -> tenant', loadedPayment.tenant.id, tenant.id);
  check('payment status enum', loadedPayment.status, PaymentStatus.Partial);
  check('payment due date', loadedPayment.dueDate, '2026-10-05');

  const loadedComplaint = await complaintRepo.findOne({
    where: { id: complaint.id },
    relations: { tenant: true, pg: true }
  });
  if (!loadedComplaint) throw new Error('Complaint could not be read back');
  check('complaint -> tenant', loadedComplaint.tenant.id, tenant.id);
  check('complaint -> pg', loadedComplaint.pg.id, pg.id);
  check('complaint status enum', loadedComplaint.status, ComplaintStatus.Open);

  const loadedAnnouncement = await announcementRepo.findOne({
    where: { id: announcement.id },
    relations: { pg: true, createdBy: true }
  });
  if (!loadedAnnouncement) throw new Error('Announcement could not be read back');
  check('announcement -> pg', loadedAnnouncement.pg.id, pg.id);
  check('announcement -> createdBy user', loadedAnnouncement.createdBy.id, user.id);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await cleanupTestData();
    await createAndVerify();
    console.log('\nAll Phase 2 core-entity read/write checks passed.');
  } finally {
    await cleanupTestData();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 2 verification FAILED:', error);
  process.exit(1);
});
