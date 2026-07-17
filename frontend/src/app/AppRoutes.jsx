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
import { SimListPage } from '../features/sim/SimListPage.jsx'
import { SimCardPage } from '../features/sim/SimCardPage.jsx'
import { PassListPage } from '../features/passes/PassListPage.jsx'
import { PassCardPage } from '../features/passes/PassCardPage.jsx'
import { PremisesPage } from '../features/premises/PremisesPage.jsx'
import { TypesEditorPage } from '../features/types/TypesEditorPage.jsx'
import { SettingsPage } from '../features/settings/SettingsPage.jsx'
import { ConfirmEmailChangePage } from '../features/profile/ConfirmEmailChangePage.jsx'
import { ProfilePage } from '../features/profile/ProfilePage.jsx'
import { GuidePage } from '../features/guide/GuidePage.jsx'
import { AppLayout } from './AppLayout.jsx'
import { NotFoundPage } from './NotFoundPage.jsx'
import { RequireAdmin, RequireAuth, RequireGuest, RequireSetupPending, RequireStaff, RequireViewer } from './guards.jsx'

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
      {/* Ссылки из писем работают независимо от текущей сессии —
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
        <Route
          path="/"
          element={
            <RequireViewer>
              <EquipmentListPage />
            </RequireViewer>
          }
        />
        <Route
          path="/equipment/new"
          element={
            <RequireStaff>
              <EquipmentFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/equipment/:id"
          element={
            <RequireViewer>
              <EquipmentCardPage />
            </RequireViewer>
          }
        />
        <Route
          path="/equipment/:id/edit"
          element={
            <RequireStaff>
              <EquipmentFormPage />
            </RequireStaff>
          }
        />
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
            <RequireViewer>
              <LicenseListPage />
            </RequireViewer>
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
            <RequireViewer>
              <LicenseCardPage />
            </RequireViewer>
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
            <RequireViewer>
              <EmployeeListPage />
            </RequireViewer>
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
            <RequireViewer>
              <EmployeeCardPage />
            </RequireViewer>
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
          path="/sim-cards"
          element={
            <RequireViewer>
              <SimListPage />
            </RequireViewer>
          }
        />
        <Route
          path="/sim-cards/:id"
          element={
            <RequireViewer>
              <SimCardPage />
            </RequireViewer>
          }
        />
        <Route
          path="/passes"
          element={
            <RequireViewer>
              <PassListPage />
            </RequireViewer>
          }
        />
        <Route
          path="/passes/:id"
          element={
            <RequireViewer>
              <PassCardPage />
            </RequireViewer>
          }
        />
        <Route
          path="/premises"
          element={
            <RequireViewer>
              <PremisesPage />
            </RequireViewer>
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
        <Route path="/guide" element={<GuidePage />} />
      </Route>

      {/* Ссылка из письма «Подтверждение смены email» — сама себя
          аутентифицирует токеном, не требует активной сессии. */}
      <Route path="/change-email/:token" element={<ConfirmEmailChangePage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
