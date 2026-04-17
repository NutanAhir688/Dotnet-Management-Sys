import { useEffect, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { useAuth } from '../hooks/useAuth'
import { agenciesApi, authApi } from '../services/api'

export function RegisterUserPage() {
  const { token } = useAuth()

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Shopkeeper',
    agencyId: '',
  })

  const [agencies, setAgencies] = useState([])
  const [loadingAgencies, setLoadingAgencies] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadAgencies = async () => {
      setLoadingAgencies(true)
      try {
        const response = await agenciesApi.list(token)
        setAgencies(response)
      } catch {
        setAgencies([])
      } finally {
        setLoadingAgencies(false)
      }
    }

    loadAgencies()
  }, [token])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      await authApi.register(token, {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        agencyId: form.role === 'Agency' && form.agencyId ? form.agencyId : null,
      })

      setSuccess('User registered successfully.')
      setForm({
        username: '',
        email: '',
        password: '',
        role: 'Shopkeeper',
        agencyId: '',
      })
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Registration failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Register User"
        description="Admin-only user creation with role assignment."
      />

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <StatusBanner variant="error" message={error} />
        <StatusBanner variant="success" message={success} />

        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            value={form.username}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" value={form.role} onChange={handleChange}>
            <option value="Admin">Admin</option>
            <option value="Agency">Agency</option>
            <option value="Shopkeeper">Shopkeeper</option>
          </select>
        </div>

        {form.role === 'Agency' ? (
          <div className="form-field">
            <label htmlFor="agencyId">Agency (optional)</label>
            <select
              id="agencyId"
              name="agencyId"
              value={form.agencyId}
              onChange={handleChange}
              disabled={loadingAgencies}
            >
              <option value="">Select agency</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Registering...' : 'Register User'}
        </button>
      </form>
    </section>
  )
}
