import type { Announcement } from '../entities/announcement.entity';
import type { Complaint } from '../entities/complaint.entity';
import type { Pg } from '../entities/pg.entity';
import type { RentPayment } from '../entities/rent_payment.entity';
import type { Room } from '../entities/room.entity';
import type { Tenant } from '../entities/tenant.entity';
import type { TenantDocument } from '../entities/tenant_docs.entity';
import type { User } from '../entities/user.entity';
import type { GraphQLContext } from '../types';
import {
  requireAdmin,
  requireAuth,
  requireRole,
  requireTenant,
  unauthenticated
} from '../authUtility/authmiddleware';
import * as authService from './services/auth.service';
import * as announcementService from './services/announcement.service';
import * as complaintService from './services/complaint.service';
import * as paymentService from './services/payment.service';
import * as pgService from './services/pg.service';
import * as relationsService from './services/relations.service';
import * as roomService from './services/room.service';
import * as tenantService from './services/tenant.service';

// Resolvers stay thin: they only authorize, delegate to the service layer,
// and shape entity fields (MRD rule: business logic lives in services).
export const resolvers = {
  Query: {
    health: () => 'ok',

    me: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      if (ctx.user) {
        return authService.getCurrentUser(ctx.user.id);
      }
      // A present-but-invalid access cookie usually means the session expired.
      // Surface UNAUTHENTICATED so the client's refresh link can rotate and
      // retry; with no cookie at all the visitor is simply a guest.
      const cookieName = process.env.JWT_COOKIE_NAME ?? 'hm_access';
      const hasAccessCookie = typeof ctx.req.cookies?.[cookieName] === 'string';
      if (hasAccessCookie) {
        throw unauthenticated('Session expired');
      }
      return null;
    },

    allUsers: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireRole(ctx, 'Admin');
      return authService.getAllUsers();
    },

    getAllPgs: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return pgService.getAllPgs();
    },

    getAllPgsRooms: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return pgService.getAllPgsRooms();
    },

    getTenantPgRoom: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const user = requireTenant(ctx);
      return pgService.getTenantPgRoom(user.id);
    },

    getAllRooms: (
      _parent: unknown,
      args: roomService.RoomListArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return roomService.getAllRooms(args);
    },

    getAllTenants: (
      _parent: unknown,
      args: tenantService.TenantListArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return tenantService.getAllTenants(args);
    },

    getAllRentPayments: (
      _parent: unknown,
      args: paymentService.RentPaymentListArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return paymentService.getAllRentPayments(args);
    },

    getAdminRentSummary: (
      _parent: unknown,
      args: paymentService.RentSummaryArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return paymentService.getAdminRentSummary(args);
    },

    getRentPaymentHistory: (
      _parent: unknown,
      args: paymentService.PaymentHistoryArgs,
      ctx: GraphQLContext
    ) => {
      // The service scopes strictly to the caller's own tenant record — no
      // tenantId is accepted from input (FR-23/FR-20 role boundary).
      const user = requireTenant(ctx);
      return paymentService.getRentPaymentHistory(user.id, args);
    },

    getAdminRentHistory: (
      _parent: unknown,
      args: paymentService.PaymentHistoryArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return paymentService.getAdminRentHistory(args);
    },

    getAllComplaints: (
      _parent: unknown,
      args: complaintService.ComplaintListArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return complaintService.getAllComplaints(args);
    },

    getTenantComplaints: (
      _parent: unknown,
      args: complaintService.ComplaintHistoryArgs,
      ctx: GraphQLContext
    ) => {
      // The service scopes strictly to the caller's own tenant record — no
      // tenantId is accepted from input (FR-23 role boundary).
      const user = requireTenant(ctx);
      return complaintService.getTenantComplaints(user.id, args);
    },

    getAllAnnouncements: (
      _parent: unknown,
      args: announcementService.AnnouncementListArgs,
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return announcementService.getAllAnnouncements(args);
    },

    getTenantPgAnnouncements: (
      _parent: unknown,
      args: announcementService.AnnouncementHistoryArgs,
      ctx: GraphQLContext
    ) => {
      // The service scopes strictly to the caller's own PG — no pgId is
      // accepted from input (FR-27 role boundary).
      const user = requireTenant(ctx);
      return announcementService.getTenantPgAnnouncements(user.id, args);
    }
  },

  Mutation: {
    registerUser: (
      _parent: unknown,
      args: { input: authService.RegisterInput },
      ctx: GraphQLContext
    ) => authService.registerUser(args.input, ctx.res),

    loginUser: (
      _parent: unknown,
      args: { input: authService.LoginInput },
      ctx: GraphQLContext
    ) => authService.loginUser(args.input, ctx.res),

    logoutUser: (_parent: unknown, _args: unknown, ctx: GraphQLContext) =>
      authService.logoutUser(ctx.res),

    refreshToken: (_parent: unknown, _args: unknown, ctx: GraphQLContext) =>
      authService.refreshUserSession(ctx.req, ctx.res),

    updateProfile: (
      _parent: unknown,
      args: { input: authService.UpdateProfileInput },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);
      return authService.updateProfile(user.id, args.input);
    },

    createPg: (
      _parent: unknown,
      args: { input: pgService.CreatePgInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return pgService.createPg(args.input);
    },

    updatePg: (
      _parent: unknown,
      args: { id: string; input: pgService.UpdatePgInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return pgService.updatePg(args.id, args.input);
    },

    createRoom: (
      _parent: unknown,
      args: { input: roomService.CreateRoomInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return roomService.createRoom(args.input);
    },

    updateRoom: (
      _parent: unknown,
      args: { id: string; input: roomService.UpdateRoomInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return roomService.updateRoom(args.id, args.input);
    },

    createTenant: (
      _parent: unknown,
      args: { input: tenantService.CreateTenantInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return tenantService.createTenant(args.input);
    },

    updateTenant: (
      _parent: unknown,
      args: { id: string; input: tenantService.UpdateTenantInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return tenantService.updateTenant(args.id, args.input);
    },

    createRentPayment: (
      _parent: unknown,
      args: { input: paymentService.CreateRentPaymentInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return paymentService.createRentPayment(args.input);
    },

    updateRentPayment: (
      _parent: unknown,
      args: { id: string; input: paymentService.UpdateRentPaymentInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return paymentService.updateRentPayment(args.id, args.input);
    },

    createComplaint: (
      _parent: unknown,
      args: { input: complaintService.CreateComplaintInput },
      ctx: GraphQLContext
    ) => {
      // The service derives the tenant and PG from the caller — a tenant can
      // never file a complaint against another tenant's PG (FR-22).
      const user = requireTenant(ctx);
      return complaintService.createComplaint(user.id, args.input);
    },

    updateComplaint: (
      _parent: unknown,
      args: { id: string; input: complaintService.UpdateComplaintInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return complaintService.updateComplaint(args.id, args.input);
    },

    createAnnouncement: (
      _parent: unknown,
      args: { input: announcementService.CreateAnnouncementInput },
      ctx: GraphQLContext
    ) => {
      // The service derives the creator from the caller — an announcement
      // can never be attributed to another user (FR-25).
      const user = requireAdmin(ctx);
      return announcementService.createAnnouncement(user.id, args.input);
    },

    updateAnnouncement: (
      _parent: unknown,
      args: { id: string; input: announcementService.UpdateAnnouncementInput },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return announcementService.updateAnnouncement(args.id, args.input);
    }
  },

  // Serialize entity dates as ISO strings for the String! schema fields, and
  // resolve entity relations on demand. Services pre-load the relations their
  // own operations return; these resolvers cover every other reachable path
  // (prefer an already-loaded relation, otherwise re-fetch via the service).
  User: {
    createdAt: (parent: User) => parent.createdAt.toISOString(),
    updatedAt: (parent: User) => parent.updatedAt.toISOString(),
    tenant: (parent: User) =>
      parent.tenant ??
      relationsService.userWithRelations(parent.id).then((user) => user?.tenant ?? null)
  },

  Pg: {
    createdAt: (parent: Pg) => parent.createdAt.toISOString(),
    updatedAt: (parent: Pg) => parent.updatedAt.toISOString(),
    rooms: (parent: Pg) => parent.rooms ?? relationsService.roomsForPg(parent.id),
    tenants: (parent: Pg) => parent.tenants ?? relationsService.tenantsForPg(parent.id),
    complaints: (parent: Pg) =>
      parent.complaints ?? relationsService.complaintsForPg(parent.id),
    announcements: (parent: Pg) =>
      parent.announcements ?? relationsService.announcementsForPg(parent.id)
  },

  Room: {
    createdAt: (parent: Room) => parent.createdAt.toISOString(),
    updatedAt: (parent: Room) => parent.updatedAt.toISOString(),
    pg: (parent: Room) =>
      parent.pg ?? relationsService.roomWithRelations(parent.id).then((room) => room?.pg ?? null),
    tenants: (parent: Room) => parent.tenants ?? relationsService.tenantsForRoom(parent.id)
  },

  Tenant: {
    createdAt: (parent: Tenant) => parent.createdAt.toISOString(),
    updatedAt: (parent: Tenant) => parent.updatedAt.toISOString(),
    user: (parent: Tenant) =>
      parent.user ??
      relationsService.tenantWithRelations(parent.id).then((tenant) => tenant?.user ?? null),
    pg: (parent: Tenant) =>
      parent.pg ??
      relationsService.tenantWithRelations(parent.id).then((tenant) => tenant?.pg ?? null),
    room: (parent: Tenant) =>
      parent.room ??
      relationsService.tenantWithRelations(parent.id).then((tenant) => tenant?.room ?? null),
    documents: (parent: Tenant) =>
      parent.documents ?? relationsService.documentsForTenant(parent.id),
    payments: (parent: Tenant) =>
      parent.payments ?? relationsService.paymentsForTenant(parent.id),
    complaints: (parent: Tenant) =>
      parent.complaints ?? relationsService.complaintsForTenant(parent.id)
  },

  TenantDocument: {
    createdAt: (parent: TenantDocument) => parent.createdAt.toISOString(),
    updatedAt: (parent: TenantDocument) => parent.updatedAt.toISOString(),
    tenant: (parent: TenantDocument) =>
      parent.tenant ??
      relationsService.documentWithRelations(parent.id).then((document) => document?.tenant ?? null)
  },

  RentPayment: {
    // Live status: a payment's status can change as time passes (a pending
    // payment silently becomes overdue after its due date) with no write. The
    // stored value is only the snapshot from the last write; the response
    // always shows the truth.
    status: (parent: RentPayment) => paymentService.resolvePaymentStatus(parent),
    createdAt: (parent: RentPayment) => parent.createdAt.toISOString(),
    updatedAt: (parent: RentPayment) => parent.updatedAt.toISOString(),
    tenant: (parent: RentPayment) =>
      parent.tenant ??
      relationsService.paymentWithRelations(parent.id).then((payment) => payment?.tenant ?? null)
  },

  Complaint: {
    createdAt: (parent: Complaint) => parent.createdAt.toISOString(),
    updatedAt: (parent: Complaint) => parent.updatedAt.toISOString(),
    resolvedAt: (parent: Complaint) =>
      parent.resolvedAt ? parent.resolvedAt.toISOString() : null,
    tenant: (parent: Complaint) =>
      parent.tenant ??
      relationsService.complaintWithRelations(parent.id).then((complaint) => complaint?.tenant ?? null),
    pg: (parent: Complaint) =>
      parent.pg ??
      relationsService.complaintWithRelations(parent.id).then((complaint) => complaint?.pg ?? null)
  },

  Announcement: {
    createdAt: (parent: Announcement) => parent.createdAt.toISOString(),
    updatedAt: (parent: Announcement) => parent.updatedAt.toISOString(),
    pg: (parent: Announcement) =>
      parent.pg ??
      relationsService.announcementWithRelations(parent.id).then((a) => a?.pg ?? null),
    createdBy: (parent: Announcement) =>
      parent.createdBy ??
      relationsService
        .announcementWithRelations(parent.id)
        .then((announcement) => announcement?.createdBy ?? null)
  }
};
