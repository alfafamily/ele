import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './app/AppRoutes.jsx'
import { AuthProvider, useAuth } from './app/AuthContext.jsx'
import { CompanyProvider } from './app/CompanyContext.jsx'
import { ErrorBoundary } from './app/ErrorBoundary.jsx'
import { Spinner } from './shared/ui'

function BootstrapGate({ children }) {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }
  return children
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BootstrapGate>
          <CompanyProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </CompanyProvider>
        </BootstrapGate>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
