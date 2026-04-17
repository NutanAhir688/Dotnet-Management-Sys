import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { PaginationControls } from '../components/common/PaginationControls'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { field, normalizePagedResponse } from '../lib/normalize'
import { useAuth } from '../hooks/useAuth'
import { productsApi } from '../services/api'

function mapProduct(raw) {
  return {
    id: field(raw, 'id'),
    name: field(raw, 'name') ?? '',
    description: field(raw, 'description') ?? '',
    price: Number(field(raw, 'price') ?? 0),
    stockQuantity: Number(field(raw, 'stockQuantity') ?? 0),
    agencyId: field(raw, 'agencyId') ?? null,
    shopkeeperUserId: field(raw, 'shopkeeperUserId') ?? null,
    ownerType: field(raw, 'ownerType') ?? '-',
    ownerName: field(raw, 'ownerName') ?? '-',
  }
}

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '0',
  stockQuantity: '0',
  agencyId: '',
  shopkeeperUserId: '',
}

export function ProductsPage() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Admin'

  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('Name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [agencyIdFilter, setAgencyIdFilter] = useState('')
  const [shopkeeperIdFilter, setShopkeeperIdFilter] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await productsApi.list(token, {
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
        agencyId: agencyIdFilter || undefined,
        shopkeeperId: shopkeeperIdFilter || undefined,
      })

      const normalized = normalizePagedResponse(response)
      setProducts((normalized.data || []).map(mapProduct))
      setTotalPages(normalized.totalPages)
      setTotalCount(normalized.totalCount)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load products.'))
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, search, sortBy, sortOrder, agencyIdFilter, shopkeeperIdFilter])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId('')
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        stockQuantity: Number(form.stockQuantity),
      }

      if (isAdmin) {
        payload.agencyId = form.agencyId || null
        payload.shopkeeperUserId = form.shopkeeperUserId || null
      }

      if (editingId) {
        await productsApi.update(token, editingId, payload)
        setSuccess('Product updated successfully.')
      } else {
        await productsApi.create(token, payload)
        setSuccess('Product created successfully.')
      }

      resetForm()
      await loadProducts()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to save product.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      stockQuantity: String(product.stockQuantity),
      agencyId: product.agencyId ?? '',
      shopkeeperUserId: product.shopkeeperUserId ?? '',
    })
  }

  const handleDelete = async (productId) => {
    const confirmed = window.confirm('Delete this product?')
    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await productsApi.remove(token, productId)
      setSuccess('Product deleted successfully.')
      if (selectedProduct?.id === productId) {
        setSelectedProduct(null)
      }
      await loadProducts()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to delete product.'))
    }
  }

  const handleDetails = async (productId) => {
    setError('')

    try {
      const response = await productsApi.getById(token, productId)
      setSelectedProduct(mapProduct(response))
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load product details.'))
    }
  }

  const rows = useMemo(() => products, [products])

  return (
    <section>
      <PageHeader title="Products" description="Search, filter, and manage inventory products." />

      <StatusBanner variant="error" message={error} />
      <StatusBanner variant="success" message={success} />

      <div className="panel">
        <h3>Filters</h3>
        <div className="grid-three">
          <div className="form-field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Name or description"
            />
          </div>

          <div className="form-field">
            <label htmlFor="sortBy">Sort By</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value)
                setPage(1)
              }}
            >
              <option value="Name">Name</option>
              <option value="Price">Price</option>
              <option value="Stock">Stock</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="sortOrder">Sort Order</label>
            <select
              id="sortOrder"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value)
                setPage(1)
              }}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="agencyFilter">Agency ID filter</label>
            <input
              id="agencyFilter"
              value={agencyIdFilter}
              onChange={(event) => {
                setAgencyIdFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Optional GUID"
            />
          </div>

          <div className="form-field">
            <label htmlFor="shopkeeperFilter">Shopkeeper ID filter</label>
            <input
              id="shopkeeperFilter"
              value={shopkeeperIdFilter}
              onChange={(event) => {
                setShopkeeperIdFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Optional GUID"
            />
          </div>

          <div className="inline-actions align-end">
            <button type="button" className="btn btn-outline" onClick={loadProducts}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Product' : 'Create Product'}</h3>

        <div className="grid-two">
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" value={form.name} onChange={handleFormChange} required />
          </div>

          <div className="form-field">
            <label htmlFor="price">Price</label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={handleFormChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="stockQuantity">Stock Quantity</label>
            <input
              id="stockQuantity"
              name="stockQuantity"
              type="number"
              min="0"
              step="1"
              value={form.stockQuantity}
              onChange={handleFormChange}
              required
            />
          </div>

          <div className="form-field full-width">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleFormChange}
              rows={2}
              required
            />
          </div>

          {isAdmin ? (
            <>
              <div className="form-field">
                <label htmlFor="agencyId">Agency ID (optional)</label>
                <input
                  id="agencyId"
                  name="agencyId"
                  value={form.agencyId}
                  onChange={handleFormChange}
                  placeholder="GUID"
                />
              </div>
              <div className="form-field">
                <label htmlFor="shopkeeperUserId">Shopkeeper User ID (optional)</label>
                <input
                  id="shopkeeperUserId"
                  name="shopkeeperUserId"
                  value={form.shopkeeperUserId}
                  onChange={handleFormChange}
                  placeholder="GUID"
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="inline-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="panel">
        <h3>Product List</h3>
        {loading ? (
          <p>Loading products...</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">No products found for current filters.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Owner</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.price.toFixed(2)}</td>
                      <td>{product.stockQuantity}</td>
                      <td>
                        {product.ownerType}: {product.ownerName}
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleDetails(product.id)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleEdit(product)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleDelete(product.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {selectedProduct ? (
        <div className="panel">
          <h3>Product Details</h3>
          <div className="meta-grid">
            <span>ID: {selectedProduct.id}</span>
            <span>Name: {selectedProduct.name}</span>
            <span>Description: {selectedProduct.description}</span>
            <span>Price: {selectedProduct.price.toFixed(2)}</span>
            <span>Stock: {selectedProduct.stockQuantity}</span>
            <span>
              Owner: {selectedProduct.ownerType} / {selectedProduct.ownerName}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
