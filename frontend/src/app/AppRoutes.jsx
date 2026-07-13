import { Route, Routes } from 'react-router-dom'
import { ConfirmEmailPendingPage } from '../features/auth/ConfirmEmailPendingPage.jsx'
import { ConfirmEmailTokenPage } from '../features/auth/ConfirmEmailTokenPage.jsx'
import { LoginPage } from '../features/auth/LoginPage.jsx'
import { PasswordResetRequestPage } from '../features/auth/PasswordResetRequestPage.jsx'
import { RegisterPage } from '../features/auth/RegisterPage.jsx'
import { SetPasswordPage } from '../features/auth/SetPasswordPage.jsx'
import { SetupWizardPage } from '../features/auth/setup/SetupWizardPage.jsx'
import { EquipmentCardPage } from '../features/equipment/EquipmentCardPage.jsx'
import { EquipmentFormPage } from '../features/equipment/EquipmentFormPage.jsx'
import { EquipmentListPage } from '../features/equipment/EquipmentListPage.jsx'
import { LicenseCardPage } from '../features/licenses/LicenseCardPage.jsx'
import { LicenseFormPage } from '../features/licenses/LicenseFormPage.jsx'
import { LicenseListPage } from '../features/licenses/LicenseListPage.jsx'
import { EmployeeCardPage } from '../features/employees/EmployeeCardPage.jsx'
import { EmployeeFormPage } from '../features/employees/EmployeeFormPage.jsx'
import { EmployeeListPage } from '../features/employees/EmployeeListPage.jsx'
import { TypesEditorPage } from '../features/types/TypesEditorPage.jsx'
import { SettingsPage } from '../features/settings/SettingsPage.jsx'
import { ConfirmEmailChangePage } from '../features/profile/ConfirmEmailChangePage.jsx'
import { ProfilePage } from '../features/profile/ProfilePage.jsx'
import { AppLayout } from './AppLayout.jsx'
import { NotFoundPage } from './NotFoundPage.jsx'
import { RequireAdmin, RequireAuth, RequireGuest, RequireSetupPending, RequireStaff } from './guards.jsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <RequireSetupPending>
            <SetupWizardPage />
          </RequireSetupPending>
        }
      />
      <Route
        path="/login"
        element={
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        }
      />
      <Route
        path="/register"
        element={
          <RequireGuest>
            <RegisterPage />
          </RequireGuest>
        }
      />
      <Route
        path="/confirm-email"
        element={
          <RequireGuest>
            <ConfirmEmailPendingPage />
          </RequireGuest>
        }
      />
      <Route path="/confirm-email/:token" element={<ConfirmEmailTokenPage />} />
      <Route
        path="/reset-password"
        element={
          <RequireGuest>
            <PasswordResetRequestPage />
          </RequireGuest>
        }
      />
      {/* Ссылки из писем (§4.4, §4.5) работают независимо от текущей сессии —
          ни один из двух эндпоинтов сам не логинит пользователя. */}
      <Route path="/reset-password/:uid/:token" element={<SetPasswordPage mode="reset" />} />
      <Route path="/accept-invite/:uid/:token" element={<SetPasswordPage mode="invite" />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<EquipmentListPage />} />
        <Route path="/equipment/new" element={<EquipmentFormPage />} />
        <Route path="/equipment/:id" element={<EquipmentCardPage />} />
        <Route path="/equipment/:id/edit" element={<EquipmentFormPage />} />
        <Route
          path="/equipment-types"
          element={
            <RequireStaff>
              <TypesEditorPage domain="equipment" title="оборудования" />
            </RequireStaff>
          }
        />
        <Route
          path="/licenses"
          element={
            <RequireStaff>
              <LicenseListPage />
            </RequireStaff>
          }
        />
        <Route
          path="/licenses/new"
          element={
            <RequireStaff>
              <LicenseFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/licenses/:id"
          element={
            <RequireStaff>
              <LicenseCardPage />
            </RequireStaff>
          }
        />
        <Route
          path="/licenses/:id/edit"
          element={
            <RequireStaff>
              <LicenseFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/license-types"
          element={
            <RequireStaff>
              <TypesEditorPage domain="license" title="лицензий" />
            </RequireStaff>
          }
        />
        <Route
          path="/employees"
          element={
            <RequireStaff>
              <EmployeeListPage />
            </RequireStaff>
          }
        />
        <Route
          path="/employees/new"
          element={
            <RequireStaff>
              <EmployeeFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <RequireStaff>
              <EmployeeCardPage />
            </RequireStaff>
          }
        />
        <Route
          path="/employees/:id/edit"
          element={
            <RequireStaff>
              <EmployeeFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Ссылка из письма «Подтверждение смены email» (§4.8) — сама себя
          аутентифицирует токеном, не требует активной сессии. */}
      <Route path="/change-email/:token" element={<ConfirmEmailChangePage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
