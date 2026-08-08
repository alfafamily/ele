import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout.jsx'
import { NotFoundPage } from './NotFoundPage.jsx'
import { RouteFallback } from './RouteFallback.jsx'
import { RouteTitle } from './RouteTitle.jsx'
import { RequireAdmin, RequireAuth, RequireEquipmentViewer, RequireGuest, RequireMaintainer, RequireSetupPending, RequireStaff, RequireTransportMaintainer, RequireTransportViewer, RequireViewer } from './guards.jsx'

// B38: страницы-маршруты грузятся лениво (React.lazy) — каждый раздел уходит в
// свой чанк вместо общего index-бандла (~226 КБ gzip → на первый экран нужен
// только шелл + текущий раздел). Именованные экспорты оборачиваем в default для
// React.lazy. AppLayout/guards/NotFound остаются в основном бандле (нужны сразу).
const named = (factory, name) => lazy(() => factory().then((m) => ({ default: m[name] })))

const ConfirmEmailPendingPage = named(() => import('../features/auth/ConfirmEmailPendingPage.jsx'), 'ConfirmEmailPendingPage')
const ConfirmEmailTokenPage = named(() => import('../features/auth/ConfirmEmailTokenPage.jsx'), 'ConfirmEmailTokenPage')
const LoginPage = named(() => import('../features/auth/LoginPage.jsx'), 'LoginPage')
const PasswordResetRequestPage = named(() => import('../features/auth/PasswordResetRequestPage.jsx'), 'PasswordResetRequestPage')
const RegisterPage = named(() => import('../features/auth/RegisterPage.jsx'), 'RegisterPage')
const SetPasswordPage = named(() => import('../features/auth/SetPasswordPage.jsx'), 'SetPasswordPage')
const SetupWizardPage = named(() => import('../features/auth/setup/SetupWizardPage.jsx'), 'SetupWizardPage')
const EquipmentCardPage = named(() => import('../features/equipment/EquipmentCardPage.jsx'), 'EquipmentCardPage')
const EquipmentFormPage = named(() => import('../features/equipment/EquipmentFormPage.jsx'), 'EquipmentFormPage')
const EquipmentListPage = named(() => import('../features/equipment/EquipmentListPage.jsx'), 'EquipmentListPage')
const MaintenanceFormPage = named(() => import('../features/equipment/MaintenanceFormPage.jsx'), 'MaintenanceFormPage')
const TransportListPage = named(() => import('../features/transport/TransportListPage.jsx'), 'TransportListPage')
const TransportCardPage = named(() => import('../features/transport/TransportCardPage.jsx'), 'TransportCardPage')
const TransportFormPage = named(() => import('../features/transport/TransportFormPage.jsx'), 'TransportFormPage')
const TransportMaintenanceFormPage = named(() => import('../features/transport/MaintenanceFormPage.jsx'), 'MaintenanceFormPage')
const ToolCardPage = named(() => import('../features/tools/ToolCardPage.jsx'), 'ToolCardPage')
const ToolFormPage = named(() => import('../features/tools/ToolFormPage.jsx'), 'ToolFormPage')
const ToolListPage = named(() => import('../features/tools/ToolListPage.jsx'), 'ToolListPage')
const LicenseCardPage = named(() => import('../features/licenses/LicenseCardPage.jsx'), 'LicenseCardPage')
const LicenseFormPage = named(() => import('../features/licenses/LicenseFormPage.jsx'), 'LicenseFormPage')
const LicenseListPage = named(() => import('../features/licenses/LicenseListPage.jsx'), 'LicenseListPage')
const EmployeeCardPage = named(() => import('../features/employees/EmployeeCardPage.jsx'), 'EmployeeCardPage')
const EmployeeFormPage = named(() => import('../features/employees/EmployeeFormPage.jsx'), 'EmployeeFormPage')
const EmployeeListPage = named(() => import('../features/employees/EmployeeListPage.jsx'), 'EmployeeListPage')
const AssignmentsPage = named(() => import('../features/employees/AssignmentsPage.jsx'), 'AssignmentsPage')
const SimListPage = named(() => import('../features/sim/SimListPage.jsx'), 'SimListPage')
const SimFormPage = named(() => import('../features/sim/SimFormPage.jsx'), 'SimFormPage')
const SimCardPage = named(() => import('../features/sim/SimCardPage.jsx'), 'SimCardPage')
const PassListPage = named(() => import('../features/passes/PassListPage.jsx'), 'PassListPage')
const PassFormPage = named(() => import('../features/passes/PassFormPage.jsx'), 'PassFormPage')
const PassCardPage = named(() => import('../features/passes/PassCardPage.jsx'), 'PassCardPage')
const PremisesPage = named(() => import('../features/premises/PremisesPage.jsx'), 'PremisesPage')
const PlacesReportPage = named(() => import('../features/reports/PlacesReportPage.jsx'), 'PlacesReportPage')
const ParkingReportPage = named(() => import('../features/reports/ParkingReportPage.jsx'), 'ParkingReportPage')
const EmployeesReportPage = named(() => import('../features/reports/EmployeesReportPage.jsx'), 'EmployeesReportPage')
const TypesEditorPage = named(() => import('../features/types/TypesEditorPage.jsx'), 'TypesEditorPage')
const SettingsPage = named(() => import('../features/settings/SettingsPage.jsx'), 'SettingsPage')
const ConfirmEmailChangePage = named(() => import('../features/profile/ConfirmEmailChangePage.jsx'), 'ConfirmEmailChangePage')
const ProfilePage = named(() => import('../features/profile/ProfilePage.jsx'), 'ProfilePage')
const NotificationsPage = named(() => import('../features/notifications/NotificationsPage.jsx'), 'NotificationsPage')
const GuidePage = named(() => import('../features/guide/GuidePage.jsx'), 'GuidePage')

// B10: dev-only styleguide (живая витрина дизайн-системы). Импорт спрятан за
// import.meta.env.DEV — в прод-сборке Vite подставляет false, ветка становится
// мёртвым кодом, и Rollup выкидывает и роут, и чанк styleguide из бандла.
const StyleguidePage = import.meta.env.DEV
  ? named(() => import('./styleguide/StyleguidePage.jsx'), 'StyleguidePage')
  : null

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <RouteTitle />
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
        {/* Домашняя страница для всех ролей — Профиль (единообразно). Раздел
            Оборудование получил собственный путь /equipment (как остальные). */}
        <Route path="/" element={<Navigate to="/profile" replace />} />
        <Route
          path="/equipment"
          element={
            <RequireEquipmentViewer>
              <EquipmentListPage />
            </RequireEquipmentViewer>
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
            <RequireEquipmentViewer>
              <EquipmentCardPage />
            </RequireEquipmentViewer>
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
          path="/equipment/:id/maintenance"
          element={
            <RequireMaintainer>
              <MaintenanceFormPage />
            </RequireMaintainer>
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
          path="/transport"
          element={
            <RequireTransportViewer>
              <TransportListPage />
            </RequireTransportViewer>
          }
        />
        <Route
          path="/transport/new"
          element={
            <RequireStaff>
              <TransportFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/transport/:id"
          element={
            <RequireTransportViewer>
              <TransportCardPage />
            </RequireTransportViewer>
          }
        />
        <Route
          path="/transport/:id/edit"
          element={
            <RequireStaff>
              <TransportFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/transport/:id/maintenance"
          element={
            <RequireTransportMaintainer>
              <TransportMaintenanceFormPage />
            </RequireTransportMaintainer>
          }
        />
        <Route
          path="/transport-types"
          element={
            <RequireStaff>
              <TypesEditorPage domain="transport" title="транспорта" />
            </RequireStaff>
          }
        />
        <Route
          path="/tools"
          element={
            <RequireViewer>
              <ToolListPage />
            </RequireViewer>
          }
        />
        <Route
          path="/tools/new"
          element={
            <RequireStaff>
              <ToolFormPage />
            </RequireStaff>
          }
        />
        <Route
          path="/tools/:id"
          element={
            <RequireViewer>
              <ToolCardPage />
            </RequireViewer>
          }
        />
        <Route
          path="/tools/:id/edit"
          element={
            <RequireStaff>
              <ToolFormPage />
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
          path="/employees/assignments"
          element={
            <RequireStaff>
              <AssignmentsPage />
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
          path="/sim-cards/new"
          element={
            <RequireStaff>
              <SimFormPage />
            </RequireStaff>
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
          path="/sim-cards/:id/edit"
          element={
            <RequireStaff>
              <SimFormPage />
            </RequireStaff>
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
          path="/passes/new"
          element={
            <RequireStaff>
              <PassFormPage />
            </RequireStaff>
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
          path="/passes/:id/edit"
          element={
            <RequireStaff>
              <PassFormPage />
            </RequireStaff>
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
        {/* B45: отчёты (Администратор / Ответственный за учёт). */}
        <Route path="/premises/reports/workplaces" element={<RequireStaff><PlacesReportPage kind="workplace" /></RequireStaff>} />
        <Route path="/premises/reports/common" element={<RequireStaff><PlacesReportPage kind="common" /></RequireStaff>} />
        <Route path="/premises/reports/storage" element={<RequireStaff><PlacesReportPage kind="storage" /></RequireStaff>} />
        <Route path="/premises/reports/parking" element={<RequireStaff><ParkingReportPage /></RequireStaff>} />
        <Route path="/employees/reports/property" element={<RequireStaff><EmployeesReportPage /></RequireStaff>} />
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/guide" element={<GuidePage />} />
      </Route>

      {/* Ссылка из письма «Подтверждение смены email» — сама себя
          аутентифицирует токеном, не требует активной сессии. */}
      <Route path="/change-email/:token" element={<ConfirmEmailChangePage />} />

      {/* B10: styleguide без авторизации и вне общего лейаута — только в dev. */}
      {import.meta.env.DEV && StyleguidePage ? (
        <Route path="/styleguide" element={<StyleguidePage />} />
      ) : null}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  )
}
