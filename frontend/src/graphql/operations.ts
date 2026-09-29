import { gql } from '@apollo/client';

export const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      role
      phone
      createdAt
      updatedAt
    }
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    loginUser(input: $input) {
      id
      name
      email
      role
      phone
      createdAt
      updatedAt
    }
  }
`;

export const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    registerUser(input: $input) {
      id
      name
      email
      role
      phone
      createdAt
      updatedAt
    }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logoutUser
  }
`;

export const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      name
      email
      role
      phone
      createdAt
      updatedAt
    }
  }
`;

export const HEALTH_QUERY = gql`
  query Health {
    health
  }
`;

// ---------------------------------------------------------------------------
// Phase 4 — PG and Room Management
// Field fragments keep the selected shape consistent across every operation.
// ---------------------------------------------------------------------------

const PG_FIELDS = gql`
  fragment PgFields on Pg {
    id
    name
    address
    city
    contactNumber
    description
    createdAt
    updatedAt
  }
`;

const ROOM_FIELDS = gql`
  fragment RoomFields on Room {
    id
    roomNumber
    roomType
    capacity
    occupiedCount
    rent
    floor
    createdAt
    updatedAt
  }
`;

export const GET_ALL_PGS_QUERY = gql`
  ${PG_FIELDS}
  query GetAllPgs {
    getAllPgs {
      ...PgFields
    }
  }
`;

export const GET_ALL_PGS_ROOMS_QUERY = gql`
  ${PG_FIELDS}
  ${ROOM_FIELDS}
  query GetAllPgsRooms {
    getAllPgsRooms {
      ...PgFields
      rooms {
        ...RoomFields
      }
    }
  }
`;

export const GET_ALL_ROOMS_QUERY = gql`
  ${PG_FIELDS}
  ${ROOM_FIELDS}
  query GetAllRooms($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllRooms(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      items {
        ...RoomFields
        pg {
          ...PgFields
        }
      }
      total
      limit
      offset
    }
  }
`;

export const GET_TENANT_PG_ROOM_QUERY = gql`
  ${PG_FIELDS}
  ${ROOM_FIELDS}
  query GetTenantPgRoom {
    getTenantPgRoom {
      pg {
        ...PgFields
      }
      room {
        ...RoomFields
      }
    }
  }
`;

export const CREATE_PG_MUTATION = gql`
  ${PG_FIELDS}
  mutation CreatePg($input: CreatePgInput!) {
    createPg(input: $input) {
      ...PgFields
    }
  }
`;

export const UPDATE_PG_MUTATION = gql`
  ${PG_FIELDS}
  mutation UpdatePg($id: ID!, $input: UpdatePgInput!) {
    updatePg(id: $id, input: $input) {
      ...PgFields
    }
  }
`;

export const CREATE_ROOM_MUTATION = gql`
  ${ROOM_FIELDS}
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      ...RoomFields
      pg {
        id
      }
    }
  }
`;

export const UPDATE_ROOM_MUTATION = gql`
  ${ROOM_FIELDS}
  mutation UpdateRoom($id: ID!, $input: UpdateRoomInput!) {
    updateRoom(id: $id, input: $input) {
      ...RoomFields
    }
  }
`;

// ---------------------------------------------------------------------------
// Phase 5 — Tenant Management
// ---------------------------------------------------------------------------

const TENANT_FIELDS = gql`
  fragment TenantFields on Tenant {
    id
    name
    phone
    emergencyContact
    joinDate
    createdAt
    updatedAt
  }
`;

const TENANT_WITH_RELATIONS = gql`
  ${PG_FIELDS}
  ${ROOM_FIELDS}
  ${TENANT_FIELDS}
  fragment TenantWithRelations on Tenant {
    ...TenantFields
    user {
      id
      name
      email
      role
    }
    pg {
      ...PgFields
    }
    room {
      ...RoomFields
    }
  }
`;

/**
 * Admin user-account list for the tenant form's link-user picker. `tenant`
 * marks accounts already backing a tenant record so the picker can skip them.
 */
export const GET_ALL_USERS_QUERY = gql`
  query GetAllUsers {
    allUsers {
      id
      name
      email
      role
      phone
      createdAt
      updatedAt
      tenant {
        id
      }
    }
  }
`;

export const GET_ALL_TENANTS_QUERY = gql`
  ${TENANT_WITH_RELATIONS}
  query GetAllTenants($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllTenants(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      items {
        ...TenantWithRelations
      }
      total
      limit
      offset
    }
  }
`;

export const CREATE_TENANT_MUTATION = gql`
  ${TENANT_WITH_RELATIONS}
  mutation CreateTenant($input: CreateTenantInput!) {
    createTenant(input: $input) {
      ...TenantWithRelations
    }
  }
`;

export const UPDATE_TENANT_MUTATION = gql`
  ${TENANT_WITH_RELATIONS}
  mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) {
    updateTenant(id: $id, input: $input) {
      ...TenantWithRelations
    }
  }
`;

// ---------------------------------------------------------------------------
// Phase 6 — Rent and Payment Management
// Status is always the live derived value (never accepted from input).
// ---------------------------------------------------------------------------

const PAYMENT_FIELDS = gql`
  fragment PaymentFields on RentPayment {
    id
    amount
    paidAmount
    dueDate
    paidDate
    status
    notes
    createdAt
    updatedAt
  }
`;

const PAYMENT_WITH_TENANT = gql`
  ${PAYMENT_FIELDS}
  fragment PaymentWithTenant on RentPayment {
    ...PaymentFields
    tenant {
      id
      name
      user {
        id
        name
        email
      }
      pg {
        id
        name
      }
      room {
        id
        roomNumber
      }
    }
  }
`;

export const GET_ALL_PAYMENTS_QUERY = gql`
  ${PAYMENT_WITH_TENANT}
  query GetAllRentPayments(
    $search: String
    $pgId: ID
    $tenantId: ID
    $status: PaymentStatus
    $limit: Int
    $offset: Int
  ) {
    getAllRentPayments(
      search: $search
      pgId: $pgId
      tenantId: $tenantId
      status: $status
      limit: $limit
      offset: $offset
    ) {
      items {
        ...PaymentWithTenant
      }
      total
      limit
      offset
    }
  }
`;

export const GET_ADMIN_RENT_SUMMARY_QUERY = gql`
  query GetAdminRentSummary($pgId: ID) {
    getAdminRentSummary(pgId: $pgId) {
      totalPayments
      totalBilled
      totalCollected
      outstandingAmount
      pendingCount
      partialCount
      paidCount
      overdueCount
    }
  }
`;

export const GET_TENANT_PAYMENT_HISTORY_QUERY = gql`
  ${PAYMENT_WITH_TENANT}
  query GetRentPaymentHistory($limit: Int, $offset: Int) {
    getRentPaymentHistory(limit: $limit, offset: $offset) {
      items {
        ...PaymentWithTenant
      }
      total
      limit
      offset
    }
  }
`;

export const CREATE_RENT_PAYMENT_MUTATION = gql`
  ${PAYMENT_WITH_TENANT}
  mutation CreateRentPayment($input: CreateRentPaymentInput!) {
    createRentPayment(input: $input) {
      ...PaymentWithTenant
    }
  }
`;

export const UPDATE_RENT_PAYMENT_MUTATION = gql`
  ${PAYMENT_WITH_TENANT}
  mutation UpdateRentPayment($id: ID!, $input: UpdateRentPaymentInput!) {
    updateRentPayment(id: $id, input: $input) {
      ...PaymentWithTenant
    }
  }
`;

// ---------------------------------------------------------------------------
// Phase 7 — Complaint Management
// A new complaint is always filed by the current tenant under their own PG:
// only title and description are sent, and status is admin-managed.
// ---------------------------------------------------------------------------

const COMPLAINT_FIELDS = gql`
  fragment ComplaintFields on Complaint {
    id
    title
    description
    status
    resolvedAt
    createdAt
    updatedAt
  }
`;

const COMPLAINT_WITH_TENANT = gql`
  ${COMPLAINT_FIELDS}
  fragment ComplaintWithTenant on Complaint {
    ...ComplaintFields
    tenant {
      id
      name
      user {
        id
        email
      }
      pg {
        id
        name
      }
      room {
        id
        roomNumber
      }
    }
    pg {
      id
      name
    }
  }
`;

export const GET_ALL_COMPLAINTS_QUERY = gql`
  ${COMPLAINT_WITH_TENANT}
  query GetAllComplaints(
    $search: String
    $pgId: ID
    $tenantId: ID
    $status: ComplaintStatus
    $limit: Int
    $offset: Int
  ) {
    getAllComplaints(
      search: $search
      pgId: $pgId
      tenantId: $tenantId
      status: $status
      limit: $limit
      offset: $offset
    ) {
      items {
        ...ComplaintWithTenant
      }
      total
      limit
      offset
    }
  }
`;

export const GET_TENANT_COMPLAINTS_QUERY = gql`
  ${COMPLAINT_WITH_TENANT}
  query GetTenantComplaints($limit: Int, $offset: Int) {
    getTenantComplaints(limit: $limit, offset: $offset) {
      items {
        ...ComplaintWithTenant
      }
      total
      limit
      offset
    }
  }
`;

export const CREATE_COMPLAINT_MUTATION = gql`
  ${COMPLAINT_WITH_TENANT}
  mutation CreateComplaint($input: CreateComplaintInput!) {
    createComplaint(input: $input) {
      ...ComplaintWithTenant
    }
  }
`;

export const UPDATE_COMPLAINT_MUTATION = gql`
  ${COMPLAINT_WITH_TENANT}
  mutation UpdateComplaint($id: ID!, $input: UpdateComplaintInput!) {
    updateComplaint(id: $id, input: $input) {
      ...ComplaintWithTenant
    }
  }
`;

// ---------------------------------------------------------------------------
// Phase 8 — Announcement Management
// An announcement always belongs to one PG and one creator (the admin who
// posted it), so the fragment carries both relations: the admin list shows
// them, the tenant list shows the property name.
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_FIELDS = gql`
  fragment AnnouncementFields on Announcement {
    id
    title
    content
    createdAt
    updatedAt
  }
`;

const ANNOUNCEMENT_WITH_RELATIONS = gql`
  ${ANNOUNCEMENT_FIELDS}
  fragment AnnouncementWithRelations on Announcement {
    ...AnnouncementFields
    pg {
      id
      name
      city
    }
    createdBy {
      id
      name
      email
    }
  }
`;

export const GET_ALL_ANNOUNCEMENTS_QUERY = gql`
  ${ANNOUNCEMENT_WITH_RELATIONS}
  query GetAllAnnouncements($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllAnnouncements(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      items {
        ...AnnouncementWithRelations
      }
      total
      limit
      offset
    }
  }
`;

export const GET_TENANT_PG_ANNOUNCEMENTS_QUERY = gql`
  ${ANNOUNCEMENT_WITH_RELATIONS}
  query GetTenantPgAnnouncements($limit: Int, $offset: Int) {
    getTenantPgAnnouncements(limit: $limit, offset: $offset) {
      items {
        ...AnnouncementWithRelations
      }
      total
      limit
      offset
    }
  }
`;

export const CREATE_ANNOUNCEMENT_MUTATION = gql`
  ${ANNOUNCEMENT_WITH_RELATIONS}
  mutation CreateAnnouncement($input: CreateAnnouncementInput!) {
    createAnnouncement(input: $input) {
      ...AnnouncementWithRelations
    }
  }
`;

export const UPDATE_ANNOUNCEMENT_MUTATION = gql`
  ${ANNOUNCEMENT_WITH_RELATIONS}
  mutation UpdateAnnouncement($id: ID!, $input: UpdateAnnouncementInput!) {
    updateAnnouncement(id: $id, input: $input) {
      ...AnnouncementWithRelations
    }
  }
`;
