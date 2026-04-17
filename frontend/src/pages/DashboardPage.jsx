import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { useAuth } from '../hooks/useAuth'

const MODULES = [
  {
    title: 'Agencies',
    description: 'Manage suppliers, create agencies, and attach or detach links.',
    to: '/agencies',
    roles: ['Admin', 'Agency', 'Shopkeeper'],
  },
  {
    title: 'Products',
    description: 'Track product inventories, ownership, stock, and pricing.',
    to: '/products',
    roles: ['Admin', 'Agency', 'Shopkeeper'],
  },
  {
    title: 'Customers',
    description: 'Create and maintain retail customer records.',
    to: '/customers',
    roles: ['Admin', 'Shopkeeper'],
  },
  {
    title: 'Orders',
    description: 'Create sales and restock orders, then track statuses.',
    to: '/orders',
    roles: ['Admin', 'Agency', 'Shopkeeper'],
  },
  {
    title: 'Bills',
    description: 'Generate bills, update payment status, and download invoices.',
    to: '/bills',
    roles: ['Admin', 'Agency', 'Shopkeeper'],
  },
  {
    title: 'Register User',
    description: 'Admin-only user registration and role assignment.',
    to: '/register',
    roles: ['Admin'],
  },
]

export function DashboardPage() {
  const { user } = useAuth()

  const cards = MODULES.filter((module) => module.roles.includes(user?.role))

  return (
    <section>
      <PageHeader
        title="Dashboard"
        description="Use these shortcuts to manage all backend-supported modules."
      />

      <div className="kpi-grid">
        {cards.map((card) => (
          <article key={card.to} className="kpi-card">
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <Link className="btn btn-outline" to={card.to}>
              Open {card.title}
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
