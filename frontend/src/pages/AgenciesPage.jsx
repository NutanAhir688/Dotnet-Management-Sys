import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBanner } from '../components/common/StatusBanner'
import { field } from '../lib/normalize'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { useAuth } from '../hooks/useAuth'
import { agenciesApi } from '../services/api'

function mapAgency(raw) {
  return {
    id: field(raw, 'id'),
    name: field(raw, 'name') ?? '',
    address: field(raw, 'address') ?? '',
    phone: field(raw, 'phone') ?? '',
    taxId: field(raw, 'taxId') ?? '',
    createdAt: field(raw, 'createdAt') ?? '',
  }
}

const EMPTY_FORM = {
  name: '',
  address: '',
  phone: '',
  taxId: '',
}

export function AgenciesPage() {
  const { token, user } = useAuth()
  const [agencies, setAgencies] = useState([])
  const [discoverAgencies, setDiscoverAgencies] = useState([])
  const [selectedAgency, setSelectedAgency] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isShopkeeper = user?.role === 'Shopkeeper'

  const loadAgencies = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await agenciesApi.list(token)
      const normalized = Array.isArray(response) ? response.map(mapAgency) : []
      setAgencies(normalized)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load agencies.'))
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadDiscover = useCallback(async () => {
    if (!isShopkeeper) {
      return
    }

    try {
      const response = await agenciesApi.discover(token)
      const normalized = Array.isArray(response) ? response.map(mapAgency) : []
      setDiscoverAgencies(normalized)
    } catch {
      setDiscoverAgencies([])
    }
  }, [isShopkeeper, token])

  useEffect(() => {
    loadAgencies()
    loadDiscover()
  }, [loadAgencies, loadDiscover])

  const tableRows = useMemo(() => agencies, [agencies])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId('')
  }

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
      if (editingId) {
        await agenciesApi.update(token, editingId, form)
        setSuccess('Agency updated successfully.')
      } else {
        await agenciesApi.create(token, form)
        setSuccess('Agency created successfully.')
      }

      resetForm()
      await loadAgencies()
      await loadDiscover()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to save agency.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (agency) => {
    setEditingId(agency.id)
    setForm({
      name: agency.name,
      address: agency.address,
      phone: agency.phone,
      taxId: agency.taxId,
    })
  }

  const handleDelete = async (agencyId) => {
    const confirmed = window.confirm('Delete this agency? This action cannot be undone.')
    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await agenciesApi.remove(token, agencyId)
      setSuccess('Agency deleted successfully.')
      if (selectedAgency?.id === agencyId) {
        setSelectedAgency(null)
      }
      await loadAgencies()
      await loadDiscover()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to delete agency.'))
    }
  }

  const handleDetails = async (agencyId) => {
    setError('')
    try {
      const response = await agenciesApi.getById(token, agencyId)
      setSelectedAgency(mapAgency(response))
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load agency details.'))
    }
  }

  const handleAttach = async (agencyId) => {
    setError('')
    setSuccess('')

    try {
      await agenciesApi.attach(token, agencyId)
      setSuccess('Agency attached successfully.')
      await loadAgencies()
      await loadDiscover()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to attach agency.'))
    }
  }

  const handleDetach = async (agencyId) => {
    setError('')
    setSuccess('')

    try {
      await agenciesApi.detach(token, agencyId)
      setSuccess('Agency detached successfully.')
      await loadAgencies()
      await loadDiscover()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to detach agency.'))
    }
  }

  return (
    <section>
      <PageHeader
        title="Agencies"
        description="Create, update, and manage supplier agencies based on role permissions."
        actions={
          <button type="button" className="btn btn-outline" onClick={loadAgencies}>
            Refresh
          </button>
        }
      />

      <StatusBanner variant="error" message={error} />
      <StatusBanner variant="success" message={success} />

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Agency' : 'Create Agency'}</h3>

        <div className="grid-two">
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" value={form.phone} onChange={handleChange} required />
          </div>

          <div className="form-field">
            <label htmlFor="taxId">Tax ID</label>
            <input id="taxId" name="taxId" value={form.taxId} onChange={handleChange} required />
          </div>

          <div className="form-field full-width">
            <label htmlFor="address">Address</label>
            <textarea
              id="address"
              name="address"
              value={form.address}
              onChange={handleChange}
              rows={2}
              required
            />
          </div>
        </div>

        <div className="inline-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : editingId ? 'Update Agency' : 'Create Agency'}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="panel">
        <h3>Agency List</h3>
        {loading ? (
          <p>Loading agencies...</p>
        ) : tableRows.length === 0 ? (
          <p className="empty-state">No agencies found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Tax ID</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((agency) => (
                  <tr key={agency.id}>
                    <td>{agency.name}</td>
                    <td>{agency.phone}</td>
                    <td>{agency.taxId}</td>
                    <td>{agency.createdAt ? new Date(agency.createdAt).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleDetails(agency.id)}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleEdit(agency)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleDelete(agency.id)}
                        >
                          Delete
                        </button>
                        {isShopkeeper ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleDetach(agency.id)}
                          >
                            Detach
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isShopkeeper ? (
        <div className="panel">
          <h3>Discover Suppliers</h3>
          {discoverAgencies.length === 0 ? (
            <p className="empty-state">No new suppliers available to attach.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Tax ID</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {discoverAgencies.map((agency) => (
                    <tr key={agency.id}>
                      <td>{agency.name}</td>
                      <td>{agency.phone}</td>
                      <td>{agency.taxId}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleAttach(agency.id)}
                        >
                          Attach
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {selectedAgency ? (
        <div className="panel">
          <h3>Agency Details</h3>
          <div className="meta-grid">
            <span>Name: {selectedAgency.name}</span>
            <span>Phone: {selectedAgency.phone}</span>
            <span>Tax ID: {selectedAgency.taxId}</span>
            <span>Address: {selectedAgency.address}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
