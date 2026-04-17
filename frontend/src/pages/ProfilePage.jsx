import { useEffect, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { useAuth } from '../hooks/useAuth'
import { profileApi } from '../services/api'

export function ProfilePage() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
  })

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await profileApi.get(token)
        setProfile(response)
        setForm({
          username: response.username ?? '',
          email: response.email ?? '',
          password: '',
        })
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load profile.'))
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [token])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await profileApi.update(token, {
        username: form.username,
        email: form.email,
        password: form.password,
      })

      const refreshed = await profileApi.get(token)
      setProfile(refreshed)
      setForm((prev) => ({ ...prev, password: '' }))
      setSuccess('Profile updated successfully.')
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Profile update failed.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Profile"
        description="Update your own username, email, and password."
      />

      {loading ? <div className="panel">Loading profile...</div> : null}

      {!loading && profile ? (
        <>
          <div className="panel">
            <h3>Current Account</h3>
            <div className="meta-grid">
              <span>ID: {profile.id}</span>
              <span>Role: {profile.role}</span>
              <span>Agency ID: {profile.agencyId || 'N/A'}</span>
            </div>
          </div>

          <form className="panel form-grid" onSubmit={handleSubmit}>
            <h3>Edit Profile</h3>

            <StatusBanner variant="error" message={error} />
            <StatusBanner variant="success" message={success} />

            <div className="form-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={handleChange}
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
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">New Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Leave blank to keep existing password"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}
