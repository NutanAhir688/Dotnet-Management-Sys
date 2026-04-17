import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { PaginationControls } from '../components/common/PaginationControls'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { field, normalizePagedResponse } from '../lib/normalize'
import { useAuth } from '../hooks/useAuth'
import { agenciesApi, customersApi, ordersApi, productsApi } from '../services/api'

const ORDER_STATUSES = ['Pending', 'Accepted', 'Shipped', 'Delivered', 'Rejected']

function mapOrderItem(raw) {
  return {
    id: field(raw, 'id'),
    productId: field(raw, 'productId'),
    productName: field(raw, 'productName') ?? '-',
    quantity: Number(field(raw, 'quantity') ?? 0),
    unitPrice: Number(field(raw, 'unitPrice') ?? 0),
    totalPrice: Number(field(raw, 'totalPrice') ?? 0),
  }
}

function mapOrder(raw) {
  const items = field(raw, 'items')

  return {
    id: field(raw, 'id'),
    customerId: field(raw, 'customerId') ?? null,
    customerName: field(raw, 'customerName') ?? '-',
    agencyId: field(raw, 'agencyId') ?? null,
    agencyName: field(raw, 'agencyName') ?? '-',
    shopkeeperUserId: field(raw, 'shopkeeperUserId') ?? null,
    shopkeeperName: field(raw, 'shopkeeperName') ?? '-',
    orderDate: field(raw, 'orderDate') ?? '',
    totalAmount: Number(field(raw, 'totalAmount') ?? 0),
    taxAmount: Number(field(raw, 'taxAmount') ?? 0),
    status: field(raw, 'status') ?? 'Pending',
    items: Array.isArray(items) ? items.map(mapOrderItem) : [],
  }
}

function createEmptyItem() {
  return {
    productId: '',
    quantity: 1,
  }
}

export function OrdersPage() {
  const { token, user } = useAuth()

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusDrafts, setStatusDrafts] = useState({})

  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')

  const [customers, setCustomers] = useState([])
  const [agencies, setAgencies] = useState([])
  const [products, setProducts] = useState([])

  const [saleForm, setSaleForm] = useState({
    customerId: '',
    shopkeeperUserId: '',
    items: [createEmptyItem()],
  })

  const [restockForm, setRestockForm] = useState({
    agencyId: '',
    shopkeeperUserId: '',
    items: [createEmptyItem()],
  })

  const [loading, setLoading] = useState(false)
  const [submittingSale, setSubmittingSale] = useState(false)
  const [submittingRestock, setSubmittingRestock] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canCreateSale = ['Admin', 'Shopkeeper'].includes(user?.role)
  const canCreateRestock = ['Admin', 'Shopkeeper'].includes(user?.role)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await ordersApi.list(token, {
        page,
        pageSize,
        customerId: customerIdFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        sortOrder,
      })

      const normalized = normalizePagedResponse(response)
      setOrders((normalized.data || []).map(mapOrder))
      setTotalPages(normalized.totalPages)
      setTotalCount(normalized.totalCount)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load orders.'))
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, customerIdFilter, fromDate, toDate, sortOrder])

  const loadOptions = useCallback(async () => {
    const [customersResult, agenciesResult, productsResult] = await Promise.allSettled([
      customersApi.list(token, { page: 1, pageSize: 100 }),
      agenciesApi.list(token),
      productsApi.list(token, { page: 1, pageSize: 100 }),
    ])

    if (customersResult.status === 'fulfilled') {
      const normalized = normalizePagedResponse(customersResult.value)
      setCustomers(normalized.data || [])
    } else {
      setCustomers([])
    }

    if (agenciesResult.status === 'fulfilled') {
      setAgencies(Array.isArray(agenciesResult.value) ? agenciesResult.value : [])
    } else {
      setAgencies([])
    }

    if (productsResult.status === 'fulfilled') {
      const normalized = normalizePagedResponse(productsResult.value)
      setProducts(normalized.data || [])
    } else {
      setProducts([])
    }
  }, [token])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  const updateSaleItem = (index, key, value) => {
    setSaleForm((prev) => {
      const updated = [...prev.items]
      updated[index] = {
        ...updated[index],
        [key]: key === 'quantity' ? Number(value) : value,
      }
      return { ...prev, items: updated }
    })
  }

  const updateRestockItem = (index, key, value) => {
    setRestockForm((prev) => {
      const updated = [...prev.items]
      updated[index] = {
        ...updated[index],
        [key]: key === 'quantity' ? Number(value) : value,
      }
      return { ...prev, items: updated }
    })
  }

  const addSaleItem = () => {
    setSaleForm((prev) => ({ ...prev, items: [...prev.items, createEmptyItem()] }))
  }

  const addRestockItem = () => {
    setRestockForm((prev) => ({ ...prev, items: [...prev.items, createEmptyItem()] }))
  }

  const removeSaleItem = (index) => {
    setSaleForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const removeRestockItem = (index) => {
    setRestockForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const handleCreateSale = async (event) => {
    event.preventDefault()
    setSubmittingSale(true)
    setError('')
    setSuccess('')

    try {
      const validItems = saleForm.items
        .filter((item) => item.productId && Number(item.quantity) > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        }))

      if (!saleForm.customerId) {
        throw new Error('Please select a customer for sales order.')
      }

      if (validItems.length === 0) {
        throw new Error('Add at least one valid product item to sales order.')
      }

      const payload = {
        customerId: saleForm.customerId,
        items: validItems,
      }

      if (user?.role === 'Admin' && saleForm.shopkeeperUserId) {
        payload.shopkeeperUserId = saleForm.shopkeeperUserId
      }

      await ordersApi.createSale(token, payload)
      setSuccess('Sales order created successfully.')
      setSaleForm({
        customerId: '',
        shopkeeperUserId: '',
        items: [createEmptyItem()],
      })
      await loadOrders()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to create sales order.'))
    } finally {
      setSubmittingSale(false)
    }
  }

  const handleCreateRestock = async (event) => {
    event.preventDefault()
    setSubmittingRestock(true)
    setError('')
    setSuccess('')

    try {
      const validItems = restockForm.items
        .filter((item) => item.productId && Number(item.quantity) > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
        }))

      if (!restockForm.agencyId) {
        throw new Error('Please select an agency for restock order.')
      }

      if (validItems.length === 0) {
        throw new Error('Add at least one valid product item to restock order.')
      }

      const payload = {
        agencyId: restockForm.agencyId,
        items: validItems,
      }

      if (user?.role === 'Admin' && restockForm.shopkeeperUserId) {
        payload.shopkeeperUserId = restockForm.shopkeeperUserId
      }

      await ordersApi.createRestock(token, payload)
      setSuccess('Restock order created successfully.')
      setRestockForm({
        agencyId: '',
        shopkeeperUserId: '',
        items: [createEmptyItem()],
      })
      await loadOrders()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to create restock order.'))
    } finally {
      setSubmittingRestock(false)
    }
  }

  const handleUpdateStatus = async (orderId, currentStatus) => {
    const status = statusDrafts[orderId] ?? currentStatus
    setUpdatingStatus(true)
    setError('')
    setSuccess('')

    try {
      await ordersApi.updateStatus(token, orderId, { status })
      setSuccess('Order status updated successfully.')
      await loadOrders()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update order status.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDetails = async (orderId) => {
    setError('')

    try {
      const response = await ordersApi.getById(token, orderId)
      setSelectedOrder(mapOrder(response))
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load order details.'))
    }
  }

  const orderRows = useMemo(() => orders, [orders])

  return (
    <section>
      <PageHeader
        title="Orders"
        description="Manage sales and restock orders with status transitions."
      />

      <StatusBanner variant="error" message={error} />
      <StatusBanner variant="success" message={success} />

      <div className="panel">
        <h3>Filters</h3>
        <div className="grid-three">
          <div className="form-field">
            <label htmlFor="customerIdFilter">Customer ID</label>
            <input
              id="customerIdFilter"
              value={customerIdFilter}
              onChange={(event) => {
                setCustomerIdFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Optional GUID"
            />
          </div>

          <div className="form-field">
            <label htmlFor="fromDate">From Date</label>
            <input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="form-field">
            <label htmlFor="toDate">To Date</label>
            <input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value)
                setPage(1)
              }}
            />
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
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="inline-actions align-end">
            <button type="button" className="btn btn-outline" onClick={loadOrders}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {canCreateSale ? (
        <form className="panel form-grid" onSubmit={handleCreateSale}>
          <h3>Create Sales Order (B2C)</h3>

          <div className="grid-two">
            <div className="form-field">
              <label htmlFor="saleCustomerId">Customer</label>
              <select
                id="saleCustomerId"
                value={saleForm.customerId}
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, customerId: event.target.value }))
                }
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option
                    key={field(customer, 'id')}
                    value={field(customer, 'id')}
                  >
                    {field(customer, 'name')} ({field(customer, 'email')})
                  </option>
                ))}
              </select>
            </div>

            {user?.role === 'Admin' ? (
              <div className="form-field">
                <label htmlFor="saleShopkeeperId">Shopkeeper User ID (optional)</label>
                <input
                  id="saleShopkeeperId"
                  value={saleForm.shopkeeperUserId}
                  onChange={(event) =>
                    setSaleForm((prev) => ({ ...prev, shopkeeperUserId: event.target.value }))
                  }
                  placeholder="GUID"
                />
              </div>
            ) : null}
          </div>

          <div className="line-items">
            <h4>Items</h4>
            {saleForm.items.map((item, index) => (
              <div key={`sale-item-${index}`} className="line-item-row">
                <div className="form-field">
                  <label>Product</label>
                  <select
                    value={item.productId}
                    onChange={(event) => updateSaleItem(index, 'productId', event.target.value)}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option
                        key={field(product, 'id')}
                        value={field(product, 'id')}
                      >
                        {field(product, 'name')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) => updateSaleItem(index, 'quantity', event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => removeSaleItem(index)}
                  disabled={saleForm.items.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="inline-actions">
            <button type="button" className="btn btn-outline" onClick={addSaleItem}>
              Add Item
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingSale}>
              {submittingSale ? 'Creating...' : 'Create Sales Order'}
            </button>
          </div>
        </form>
      ) : null}

      {canCreateRestock ? (
        <form className="panel form-grid" onSubmit={handleCreateRestock}>
          <h3>Create Restock Order (B2B)</h3>

          <div className="grid-two">
            <div className="form-field">
              <label htmlFor="restockAgencyId">Agency</label>
              <select
                id="restockAgencyId"
                value={restockForm.agencyId}
                onChange={(event) =>
                  setRestockForm((prev) => ({ ...prev, agencyId: event.target.value }))
                }
                required
              >
                <option value="">Select agency</option>
                {agencies.map((agency) => (
                  <option key={field(agency, 'id')} value={field(agency, 'id')}>
                    {field(agency, 'name')}
                  </option>
                ))}
              </select>
            </div>

            {user?.role === 'Admin' ? (
              <div className="form-field">
                <label htmlFor="restockShopkeeperId">Shopkeeper User ID (optional)</label>
                <input
                  id="restockShopkeeperId"
                  value={restockForm.shopkeeperUserId}
                  onChange={(event) =>
                    setRestockForm((prev) => ({ ...prev, shopkeeperUserId: event.target.value }))
                  }
                  placeholder="GUID"
                />
              </div>
            ) : null}
          </div>

          <div className="line-items">
            <h4>Items</h4>
            {restockForm.items.map((item, index) => (
              <div key={`restock-item-${index}`} className="line-item-row">
                <div className="form-field">
                  <label>Product</label>
                  <select
                    value={item.productId}
                    onChange={(event) => updateRestockItem(index, 'productId', event.target.value)}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option
                        key={field(product, 'id')}
                        value={field(product, 'id')}
                      >
                        {field(product, 'name')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) => updateRestockItem(index, 'quantity', event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => removeRestockItem(index)}
                  disabled={restockForm.items.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="inline-actions">
            <button type="button" className="btn btn-outline" onClick={addRestockItem}>
              Add Item
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingRestock}>
              {submittingRestock ? 'Creating...' : 'Create Restock Order'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel">
        <h3>Order List</h3>
        {loading ? (
          <p>Loading orders...</p>
        ) : orderRows.length === 0 ? (
          <p className="empty-state">No orders found.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Agency</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderDate ? new Date(order.orderDate).toLocaleString() : '-'}</td>
                      <td>{order.customerName || '-'}</td>
                      <td>{order.agencyName || '-'}</td>
                      <td>{(order.totalAmount + order.taxAmount).toFixed(2)}</td>
                      <td>
                        <select
                          value={statusDrafts[order.id] ?? order.status}
                          onChange={(event) =>
                            setStatusDrafts((prev) => ({
                              ...prev,
                              [order.id]: event.target.value,
                            }))
                          }
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleDetails(order.id)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleUpdateStatus(order.id, order.status)}
                            disabled={updatingStatus}
                          >
                            Update Status
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

      {selectedOrder ? (
        <div className="panel">
          <h3>Order Details</h3>

          <div className="meta-grid">
            <span>Order ID: {selectedOrder.id}</span>
            <span>Status: {selectedOrder.status}</span>
            <span>Customer: {selectedOrder.customerName || '-'}</span>
            <span>Agency: {selectedOrder.agencyName || '-'}</span>
            <span>Total: {(selectedOrder.totalAmount + selectedOrder.taxAmount).toFixed(2)}</span>
            <span>Date: {selectedOrder.orderDate ? new Date(selectedOrder.orderDate).toLocaleString() : '-'}</span>
          </div>

          {selectedOrder.items.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id ?? `${item.productId}-${item.quantity}`}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unitPrice.toFixed(2)}</td>
                      <td>{item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No order items available.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
