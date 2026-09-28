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
