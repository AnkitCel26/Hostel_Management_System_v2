import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { RequireAuth, RequireRole } from './routes/ProtectedRoute';

import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ProfilePage } from './pages/auth/ProfilePage';

import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminPgPage } from './pages/admin/AdminPgPage';
import { AdminRoomsPage } from './pages/admin/AdminRoomsPage';
import { AdminTenantsPage } from './pages/admin/AdminTenantsPage';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage';
import { AdminComplaintsPage } from './pages/admin/AdminComplaintsPage';
import { AdminAnnouncementsPage } from './pages/admin/AdminAnnouncementsPage';

import { TenantDashboardPage } from './pages/tenants/TenantDashboardPage';
import { TenantRoomPage } from './pages/tenants/TenantRoomPage';
import { TenantPaymentsPage } from './pages/tenants/TenantPaymentsPage';
import { TenantComplaintsPage } from './pages/tenants/TenantComplaintsPage';
import { TenantAnnouncementsPage } from './pages/tenants/TenantAnnouncementsPage';
import { TenantDocumentsPage } from './pages/tenants/TenantDocumentsPage';

import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/dashboard"
          element={
            <RequireRole role="Admin">
              <AdminDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/pg"
          element={<Navigate to="/admin/properties" replace />}
        />
        <Route
          path="/admin/properties"
          element={
            <RequireRole role="Admin">
              <AdminPgPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/rooms"
          element={
            <RequireRole role="Admin">
              <AdminRoomsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/tenants"
          element={
            <RequireRole role="Admin">
              <AdminTenantsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/payments"
          element={
            <RequireRole role="Admin">
              <AdminPaymentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/complaints"
          element={
            <RequireRole role="Admin">
              <AdminComplaintsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/announcements"
          element={
            <RequireRole role="Admin">
              <AdminAnnouncementsPage />
            </RequireRole>
          }
        />

        <Route
          path="/tenant/dashboard"
          element={
            <RequireRole role="Tenant">
              <TenantDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/tenant/room"
          element={
            <RequireRole role="Tenant">
              <TenantRoomPage />
            </RequireRole>
          }
        />
        <Route
          path="/tenant/payments"
          element={
            <RequireRole role="Tenant">
              <TenantPaymentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/tenant/complaints"
          element={
            <RequireRole role="Tenant">
              <TenantComplaintsPage />
            </RequireRole>
          }
        />
        <Route
          path="/tenant/announcements"
          element={
            <RequireRole role="Tenant">
              <TenantAnnouncementsPage />
            </RequireRole>
          }
        />
        <Route
          path="/tenant/documents"
          element={
            <RequireRole role="Tenant">
              <TenantDocumentsPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
