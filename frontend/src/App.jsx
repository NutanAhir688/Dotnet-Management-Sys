import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireRole } from './components/auth/RequireRole'
import { AppLayout } from './components/layout/AppLayout'
import { AccessDeniedPage } from './pages/AccessDeniedPage'
import { AgenciesPage } from './pages/AgenciesPage'
import { BillsPage } from './pages/BillsPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterUserPage } from './pages/RegisterUserPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="agencies" element={<AgenciesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route
          path="customers"
          element={
            <RequireRole roles={['Admin', 'Shopkeeper']}>
              <CustomersPage />
            </RequireRole>
          }
        />
        <Route
          path="register"
          element={
            <RequireRole roles={['Admin']}>
              <RegisterUserPage />
            </RequireRole>
          }
        />
        <Route path="access-denied" element={<AccessDeniedPage />} />
      </Route>

      <Route path="/access-denied" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
