import 'reflect-metadata';
import { AppDataSource } from '../config/db';
import { User, UserRole } from '../entities/user.entity';
import { Pg } from '../entities/pg.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { RentPayment } from '../entities/rent_payment.entity';
import { PaymentStatus } from '../entities/rent_payment.entity';
import { Complaint, ComplaintStatus } from '../entities/complaint.entity';
import { Announcement } from '../entities/announcement.entity';
import { TenantDocument } from '../entities/tenant_docs.entity';
import { hashPassword } from '../utils/password';
import { createPg } from '../graphql/services/pg.service';
import { createRoom } from '../graphql/services/room.service';
import { createTenant } from '../graphql/services/tenant.service';
import {
  createRentPayment
} from '../graphql/services/payment.service';
import {
  createComplaint,
  updateComplaint
} from '../graphql/services/complaint.service';
import { createAnnouncement } from '../graphql/services/announcement.service';
import { uploadTenantDocs } from '../graphql/services/document.service';
import { buildDocumentUrl, warnStorageNotConfigured } from '../config/supabase';

const ADMIN_EMAIL = 'admin@hostel.test';
const ADMIN_PASSWORD = 'Admin@12345';
const TENANT_PASSWORD = 'Passw0rd123';

interface TenantSeed {
  name: string;
  email: string;
  phone: string;
  emergencyContact: string;
  joinDate: string;
  roomNumber: string | null;
}

const TENANTS: TenantSeed[] = [
  {
    name: 'Priya Sharma',
    email: 'tenant1@hostel.test',
    phone: '9876500001',
    emergencyContact: 'Kiran Sharma — 9876500091',
    joinDate: '2026-06-01',
    roomNumber: 'G-101'
  },
  {
    name: 'Rahul Verma',
    email: 'tenant2@hostel.test',
    phone: '9876500002',
    emergencyContact: 'Sunita Verma — 9876500092',
    joinDate: '2026-07-15',
    roomNumber: 'G-101'
  },
  {
    name: 'Neha Gupta',
    email: 'tenant3@hostel.test',
    phone: '9876500003',
    emergencyContact: 'Alok Gupta — 9876500093',
    joinDate: '2026-08-01',
    roomNumber: 'G-101'
  },
  {
    name: 'Arjun Patel',
    email: 'tenant4@hostel.test',
    phone: '9876500004',
    emergencyContact: 'Meera Patel — 9876500094',
    joinDate: '2026-09-01',
    roomNumber: 'G-102'
  },
  {
    name: 'Sneha Iyer',
    email: 'tenant5@hostel.test',
    phone: '9876500005',
    emergencyContact: 'Ravi Iyer — 9876500095',
    joinDate: '2026-09-20',
    roomNumber: null
  }
];

interface RoomSeed {
  roomNumber: string;
  roomType: string;
  capacity: number;
  rent: number;
  floor: number;
}

const ROOMS: RoomSeed[] = [
  { roomNumber: 'G-101', roomType: 'Shared', capacity: 3, rent: 6000, floor: 1 },
  { roomNumber: 'G-102', roomType: 'Shared', capacity: 2, rent: 6500, floor: 1 },
  { roomNumber: 'G-103', roomType: 'Single', capacity: 1, rent: 9000, floor: 2 },
  { roomNumber: 'G-104', roomType: 'Single', capacity: 1, rent: 9500, floor: 2 }
];

const PG_SEED = {
  name: 'Green Valley Residency',
  address: '12, Lake View Road, Indiranagar',
  city: 'Bengaluru',
  contactNumber: '9876500100',
  description:
    'A quiet, well-maintained residency close to the tech park. Includes home-style meals, high-speed Wi-Fi, and daily housekeeping.'
};

interface PaymentSeed {
  tenantEmail: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidDate: string | null;
  notes: string | null;
}

// One of each live status for tenant1 (paid, partial, pending, overdue).
const PAYMENTS: PaymentSeed[] = [
  {
    tenantEmail: 'tenant1@hostel.test',
    amount: 6000,
    paidAmount: 6000,
    dueDate: '2026-07-05',
    paidDate: '2026-07-04',
    notes: 'July rent — paid via UPI'
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    amount: 6000,
    paidAmount: 6000,
    dueDate: '2026-08-05',
    paidDate: '2026-08-05',
    notes: 'August rent — paid via bank transfer'
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    amount: 6000,
    paidAmount: 3000,
    dueDate: '2026-10-05',
    paidDate: null,
    notes: 'October rent — part payment received'
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    amount: 6000,
    paidAmount: 0,
    dueDate: '2026-11-05',
    paidDate: null,
    notes: 'November rent'
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    amount: 6000,
    paidAmount: 0,
    dueDate: '2026-09-20',
    paidDate: null,
    notes: 'September rent — overdue'
  },
  {
    tenantEmail: 'tenant2@hostel.test',
    amount: 6000,
    paidAmount: 6000,
    dueDate: '2026-09-05',
    paidDate: '2026-09-04',
    notes: 'September rent — paid in cash'
  },
  {
    tenantEmail: 'tenant3@hostel.test',
    amount: 6000,
    paidAmount: 0,
    dueDate: '2026-09-10',
    paidDate: null,
    notes: 'September rent — overdue'
  },
  {
    tenantEmail: 'tenant4@hostel.test',
    amount: 6500,
    paidAmount: 0,
    dueDate: '2026-10-10',
    paidDate: null,
    notes: 'October rent'
  }
];

interface ComplaintSeed {
  tenantEmail: string;
  title: string;
  description: string;
  status: ComplaintStatus;
}

const COMPLAINTS: ComplaintSeed[] = [
  {
    tenantEmail: 'tenant1@hostel.test',
    title: 'Leaking tap in the washroom',
    description:
      'The washroom tap in room G-101 keeps dripping even after tightening. Water pools on the floor overnight.',
    status: ComplaintStatus.Open
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    title: 'Broken cabinet hinge in room',
    description:
      'The upper cabinet hinge has snapped, so the door hangs loose and will not close properly.',
    status: ComplaintStatus.InProgress
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    title: 'Ceiling fan making noise',
    description:
      'The ceiling fan squeaks loudly at high speed. It was serviced and is quiet now.',
    status: ComplaintStatus.Resolved
  },
  {
    tenantEmail: 'tenant2@hostel.test',
    title: 'Wi-Fi slows down after 10 PM',
    description:
      'Every night after 10 PM the Wi-Fi becomes very slow across the floor. Streaming and calls drop.',
    status: ComplaintStatus.Open
  },
  {
    tenantEmail: 'tenant3@hostel.test',
    title: 'Water cooler not cooling',
    description:
      'The water cooler on the first floor stopped cooling. Motor was replaced and cooling is back to normal.',
    status: ComplaintStatus.Resolved
  }
];

const ANNOUNCEMENTS: Array<{
  pgName: string;
  title: string;
  content: string;
}> = [
  {
    pgName: 'Green Valley Residency',
    title: 'October rent due by the 5th',
    content:
      'A reminder that October rent is due by the 5th. You can pay by UPI, bank transfer, or cash at the office. Please keep the payment reference handy.'
  },
  {
    pgName: 'Green Valley Residency',
    title: 'Water tank cleaning this Saturday',
    content:
      'The overhead tanks will be cleaned this Saturday between 9 AM and 12 PM. Water supply will be intermittent during this window. Please store drinking water in advance.'
  },
  {
    pgName: 'Green Valley Residency',
    title: 'Diwali celebration in the common hall',
    content:
      'We are hosting a small Diwali get-together in the common hall this month. Dinner will be served at 8 PM. Please sign up on the notice board if you plan to attend.'
  },
  {
    pgName: 'Sunrise PG',
    title: 'Electrical maintenance visit next week',
    content:
      'An electrician will inspect the floor wiring next Tuesday between 11 AM and 2 PM. Power to some rooms may be switched off briefly.'
  }
];

const DEMO_DOCUMENTS: Array<{
  tenantEmail: string;
  docName: string;
  objectPath: string;
  docNumber: string | null;
}> = [
  {
    tenantEmail: 'tenant1@hostel.test',
    docName: 'Aadhaar Card',
    objectPath: 'demo/priya-sharma-aadhaar.pdf',
    docNumber: 'XXXX-XXXX-0001'
  },
  {
    tenantEmail: 'tenant1@hostel.test',
    docName: 'Rent Agreement',
    objectPath: 'demo/priya-sharma-agreement.pdf',
    docNumber: 'RA-2026-06-001'
  },
  {
    tenantEmail: 'tenant2@hostel.test',
    docName: 'ID Proof',
    objectPath: 'demo/rahul-verma-id.pdf',
    docNumber: 'XXXX-XXXX-0002'
  }
];

async function upsertUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  phone: string
): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const normalized = email.trim().toLowerCase();
  const existing = await repo.findOne({ where: { email: normalized } });
  if (existing) {
    existing.password = await hashPassword(password);
    existing.role = role;
    const saved = await repo.save(existing);
    console.log(`user re-asserted: ${saved.email} (${role})`);
    return saved;
  }
  const created = await repo.save(
    repo.create({
      name,
      email: normalized,
      password: await hashPassword(password),
      role,
      phone
    })
  );
  console.log(`user created: ${created.email} (${role})`);
  return created;
}

async function ensurePg(): Promise<Pg> {
  const repo = AppDataSource.getRepository(Pg);
  const existing = await repo.findOne({ where: { name: PG_SEED.name } });
  if (existing) {
    console.log(`pg exists: ${existing.name}`);
    return existing;
  }
  const created = await createPg(PG_SEED);
  console.log(`pg created: ${created.name}`);
  return created;
}

async function ensureRooms(pg: Pg): Promise<Map<string, Room>> {
  const repo = AppDataSource.getRepository(Room);
  const byNumber = new Map<string, Room>();
  for (const seed of ROOMS) {
    const existing = await repo.findOne({
      where: { pg: { id: pg.id }, roomNumber: seed.roomNumber }
    });
    if (existing) {
      console.log(`room exists: ${existing.roomNumber} (pg ${pg.name})`);
      byNumber.set(existing.roomNumber, existing);
      continue;
    }
    const created = await createRoom({ pgId: pg.id, ...seed });
    console.log(
      `room created: ${created.roomNumber} (pg ${pg.name}, capacity ${created.capacity}, rent ${created.rent})`
    );
    byNumber.set(created.roomNumber, created);
  }
  return byNumber;
}

async function ensureTenantRecords(
  pg: Pg,
  rooms: Map<string, Room>
): Promise<Map<string, { user: User; tenant: Tenant }>> {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const byEmail = new Map<string, { user: User; tenant: Tenant }>();

  for (const seed of TENANTS) {
    const user = await upsertUser(
      seed.name,
      seed.email,
      TENANT_PASSWORD,
      UserRole.Tenant,
      seed.phone
    );
    const existing = await tenantRepo.findOne({
      where: { user: { id: user.id } }
    });
    if (existing) {
      console.log(`tenant record exists: ${existing.name} (${seed.email})`);
      byEmail.set(seed.email, { user, tenant: existing });
      continue;
    }
    const room = seed.roomNumber
      ? rooms.get(seed.roomNumber)
      : undefined;
    if (seed.roomNumber && !room) {
      throw new Error(`seed bug: room ${seed.roomNumber} not ensured first`);
    }
    const created = await createTenant({
      userId: user.id,
      pgId: pg.id,
      roomId: room?.id ?? null,
      name: seed.name,
      phone: seed.phone,
      emergencyContact: seed.emergencyContact,
      joinDate: seed.joinDate
    });
    console.log(
      `tenant record created: ${created.name} (${seed.email}, room ${created.room?.roomNumber ?? 'none'})`
    );
    byEmail.set(seed.email, { user, tenant: created });
  }
  return byEmail;
}

async function ensurePayments(
  tenants: Map<string, { user: User; tenant: Tenant }>
): Promise<void> {
  const repo = AppDataSource.getRepository(RentPayment);
  for (const seed of PAYMENTS) {
    const entry = tenants.get(seed.tenantEmail);
    if (!entry) {
      throw new Error(`seed bug: no tenant ${seed.tenantEmail}`);
    }
    const existing = await repo.findOne({
      where: {
        tenant: { id: entry.tenant.id },
        dueDate: seed.dueDate,
        amount: seed.amount
      }
    });
    if (existing) {
      console.log(
        `payment exists: ${seed.tenantEmail} due ${seed.dueDate} amount ${seed.amount} (${existing.status})`
      );
      continue;
    }
    const created = await createRentPayment({
      tenantId: entry.tenant.id,
      amount: seed.amount,
      paidAmount: seed.paidAmount,
      dueDate: seed.dueDate,
      paidDate: seed.paidDate,
      notes: seed.notes
    });
    console.log(
      `payment created: ${seed.tenantEmail} due ${created.dueDate} amount ${created.amount} -> ${created.status}`
    );
  }
}

async function ensureComplaints(
  tenants: Map<string, { user: User; tenant: Tenant }>
): Promise<void> {
  const repo = AppDataSource.getRepository(Complaint);
  for (const seed of COMPLAINTS) {
    const entry = tenants.get(seed.tenantEmail);
    if (!entry) {
      throw new Error(`seed bug: no tenant ${seed.tenantEmail}`);
    }
    const existing = await repo.findOne({
      where: {
        tenant: { id: entry.tenant.id },
        title: seed.title
      }
    });
    if (existing) {
      console.log(
        `complaint exists: "${seed.title}" (${existing.status})`
      );
      continue;
    }
    const created = await createComplaint(entry.user.id, {
      title: seed.title,
      description: seed.description
    });
    let final = created;
    if (seed.status !== ComplaintStatus.Open) {
      final = await updateComplaint(created.id, { status: seed.status });
    }
    console.log(
      `complaint created: "${final.title}" -> ${final.status}${final.resolvedAt ? ' (resolvedAt set)' : ''}`
    );
  }
}

async function ensureAnnouncements(admin: User): Promise<void> {
  const pgRepo = AppDataSource.getRepository(Pg);
  const repo = AppDataSource.getRepository(Announcement);
  for (const seed of ANNOUNCEMENTS) {
    const pg = await pgRepo.findOne({ where: { name: seed.pgName } });
    if (!pg) {
      throw new Error(`seed bug: pg ${seed.pgName} not found`);
    }
    const existing = await repo.findOne({
      where: { pg: { id: pg.id }, title: seed.title }
    });
    if (existing) {
      console.log(`announcement exists: "${seed.title}" (pg ${pg.name})`);
      continue;
    }
    const created = await createAnnouncement(admin.id, {
      pgId: pg.id,
      title: seed.title,
      content: seed.content
    });
    console.log(`announcement created: "${created.title}" (pg ${pg.name})`);
  }
}

async function ensureDocuments(
  tenants: Map<string, { user: User; tenant: Tenant }>
): Promise<void> {
  const repo = AppDataSource.getRepository(TenantDocument);
  const byEmail = new Map<string, typeof DEMO_DOCUMENTS>();
  for (const doc of DEMO_DOCUMENTS) {
    const list = byEmail.get(doc.tenantEmail) ?? [];
    list.push(doc);
    byEmail.set(doc.tenantEmail, list);
  }
  for (const [email, docs] of byEmail) {
    const entry = tenants.get(email);
    if (!entry) {
      throw new Error(`seed bug: no tenant ${email}`);
    }
    const missing: Array<{ docName: string; docUrl: string; docNumber: string | null }> = [];
    for (const doc of docs) {
      const existing = await repo.findOne({
        where: { tenant: { id: entry.tenant.id }, docName: doc.docName }
      });
      const docUrl = buildDocumentUrl(doc.objectPath);
      if (!docUrl) {
        warnStorageNotConfigured('seed:demo');
        if (existing) {
          console.log(`document exists: ${doc.docName} (${email})`);
        } else {
          console.log(`document skipped: ${doc.docName} (${email}) — no SUPABASE_URL`);
        }
        continue;
      }
      if (existing) {
        if (existing.docUrl !== docUrl) {
          existing.docUrl = docUrl;
          await repo.save(existing);
          console.log(`document url repointed: ${doc.docName} (${email}) -> ${docUrl}`);
        } else {
          console.log(`document exists: ${doc.docName} (${email})`);
        }
        continue;
      }
      missing.push({ docName: doc.docName, docUrl, docNumber: doc.docNumber });
    }
    if (missing.length === 0) {
      continue;
    }
    const created = await uploadTenantDocs(entry.user.id, { docs: missing });
    for (const doc of created) {
      console.log(`document created: ${doc.docName} (${email})`);
    }
  }
}

async function reportLiveStatuses(): Promise<void> {
  const repo = AppDataSource.getRepository(RentPayment);
  const payments = await repo.find();
  const counts = new Map<string, number>();
  for (const payment of payments) {
    // Live derivation, same rule as the status field resolver.
    const status =
      payment.paidAmount >= payment.amount
        ? PaymentStatus.Paid
        : payment.dueDate < new Date().toISOString().slice(0, 10)
          ? PaymentStatus.Overdue
          : payment.paidAmount > 0
            ? PaymentStatus.Partial
            : PaymentStatus.Pending;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([status, count]) => `${status}=${count}`)
    .join(', ');
  console.log(`live payment statuses: ${summary || 'none'}`);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    console.log('--- seeding demo data ---');

    const admin = await upsertUser(
      'Portal Admin',
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      UserRole.Admin,
      '9876500100'
    );

    const pg = await ensurePg();
    const rooms = await ensureRooms(pg);
    const tenants = await ensureTenantRecords(pg, rooms);
    await ensurePayments(tenants);
    await ensureComplaints(tenants);
    await ensureAnnouncements(admin);
    await ensureDocuments(tenants);
    await reportLiveStatuses();

    console.log('--- seed complete ---');
    console.log(`admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`tenant login: tenant1@hostel.test / ${TENANT_PASSWORD}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Failed to seed demo data:', error);
  process.exit(1);
});
