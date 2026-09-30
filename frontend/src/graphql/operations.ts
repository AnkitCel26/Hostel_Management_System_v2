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

// Field fragments keep the selected shape consistent across every operation.
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
    $month: String
    $limit: Int
    $offset: Int
  ) {
    getAllRentPayments(
      search: $search
      pgId: $pgId
      tenantId: $tenantId
      status: $status
      month: $month
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
  query GetAdminRentSummary($pgId: ID, $month: String) {
    getAdminRentSummary(pgId: $pgId, month: $month) {
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

export const PAY_RENT_MUTATION = gql`
  ${PAYMENT_FIELDS}
  mutation PayRent($input: PayRentInput!) {
    payRent(input: $input) {
      ...PaymentFields
    }
  }
`;

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

const TENANT_DOCUMENT_FIELDS = gql`
  fragment TenantDocumentFields on TenantDocument {
    id
    docName
    docUrl
    docNumber
    createdAt
    updatedAt
  }
`;

export const GET_TENANT_DOCUMENTS_QUERY = gql`
  ${TENANT_DOCUMENT_FIELDS}
  query GetTenantDocuments($limit: Int, $offset: Int) {
    getTenantDocuments(limit: $limit, offset: $offset) {
      items {
        ...TenantDocumentFields
      }
      total
      limit
      offset
    }
  }
`;

export const UPLOAD_TENANT_DOCS_MUTATION = gql`
  ${TENANT_DOCUMENT_FIELDS}
  mutation UploadTenantDocs($input: UploadTenantDocsInput!) {
    uploadTenantDocs(input: $input) {
      ...TenantDocumentFields
    }
  }
`;

export const UPDATE_TENANT_DOCS_MUTATION = gql`
  ${TENANT_DOCUMENT_FIELDS}
  mutation UpdateTenantDocs($id: ID!, $input: UpdateTenantDocsInput!) {
    updateTenantDocs(id: $id, input: $input) {
      ...TenantDocumentFields
    }
  }
`;

export const DELETE_TENANT_DOCUMENTS_MUTATION = gql`
  mutation DeleteTenantDocuments($ids: [ID!]!) {
    deleteTenantDocuments(ids: $ids)
  }
`;

const RECENT_PAYMENT_FIELDS = gql`
  fragment RecentPaymentFields on RentPayment {
    id
    amount
    paidAmount
    dueDate
    paidDate
    status
    createdAt
    updatedAt
    tenant {
      id
      name
      room {
        id
        roomNumber
      }
    }
  }
`;

const RECENT_COMPLAINT_FIELDS = gql`
  fragment RecentComplaintFields on Complaint {
    id
    title
    status
    resolvedAt
    createdAt
    updatedAt
    tenant {
      id
      name
      room {
        id
        roomNumber
      }
    }
  }
`;

export const GET_ADMIN_DASHBOARD_STATS_QUERY = gql`
  ${RECENT_PAYMENT_FIELDS}
  ${RECENT_COMPLAINT_FIELDS}
  query GetAdminDashboardStats($pgId: ID) {
    getAdminDashboardStats(pgId: $pgId) {
      totalPgs
      totalRooms
      occupiedRooms
      vacantRooms
      totalBeds
      occupiedBeds
      occupancyPercent
      totalTenants
      totalPayments
      paidCount
      partialCount
      pendingCount
      overdueCount
      totalBilled
      totalCollected
      outstandingAmount
      openComplaints
      inProgressComplaints
      resolvedComplaints
      totalAnnouncements
      occupancyByProperty {
        pgId
        pgName
        totalRooms
        occupiedRooms
        totalBeds
        occupiedBeds
        occupancyPercent
      }
      recentPayments {
        items {
          ...RecentPaymentFields
        }
        total
        limit
        offset
      }
      recentComplaints {
        items {
          ...RecentComplaintFields
        }
        total
        limit
        offset
      }
    }
  }
`;
