import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { PaginationControls } from '../components/common/PaginationControls'
import { StatusBanner } from '../components/common/StatusBanner'
import { formatFieldErrors, getErrorMessage } from '../lib/errors'
import { field, normalizePagedResponse } from '../lib/normalize'
import { useAuth } from '../hooks/useAuth'
import { billsApi, ordersApi } from '../services/api'

const PAYMENT_STATUSES = ['Pending', 'Partial', 'Completed', 'Failed']

function mapBill(raw) {
  return {
    id: field(raw, 'id'),
    billNumber: field(raw, 'billNumber') ?? '-',
    orderId: field(raw, 'orderId') ?? null,
    customerId: field(raw, 'customerId') ?? null,
    customerName: field(raw, 'customerName') ?? '-',
    amount: Number(field(raw, 'amount') ?? 0),
    paidAmount: Number(field(raw, 'paidAmount') ?? 0),
    balanceAmount: Number(field(raw, 'balanceAmount') ?? 0),
    paymentMethod: field(raw, 'paymentMethod') ?? '-',
    paymentStatus: field(raw, 'paymentStatus') ?? 'Pending',
    createdAt: field(raw, 'createdAt') ?? '',
  }
}

export function BillsPage() {
  const { token } = useAuth()

  const [bills, setBills] = useState([])
  const [orderOptions, setOrderOptions] = useState([])
  const [selectedBill, setSelectedBill] = useState(null)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')

  const [generateForm, setGenerateForm] = useState({
    orderId: '',
    paymentMethod: 'Offline',
    paymentStatus: 'Pending',
  })

  const [statusDrafts, setStatusDrafts] = useState({})
  const [paymentDrafts, setPaymentDrafts] = useState({})

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadBills = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await billsApi.list(token, {
        page,
        pageSize,
        customerId: customerIdFilter || undefined,
        paymentMethod: paymentMethodFilter || undefined,
        paymentStatus: paymentStatusFilter || undefined,
        sortOrder,
      })

      const normalized = normalizePagedResponse(response)
      setBills((normalized.data || []).map(mapBill))
      setTotalPages(normalized.totalPages)
      setTotalCount(normalized.totalCount)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load bills.'))
    } finally {
      setLoading(false)
    }
  }, [token, page, pageSize, customerIdFilter, paymentMethodFilter, paymentStatusFilter, sortOrder])

  const loadOrderOptions = useCallback(async () => {
    try {
      const response = await ordersApi.list(token, {
        page: 1,
        pageSize: 100,
        sortOrder: 'desc',
      })

      const normalized = normalizePagedResponse(response)
      setOrderOptions(normalized.data || [])
    } catch {
      setOrderOptions([])
    }
  }, [token])

  useEffect(() => {
    loadBills()
  }, [loadBills])

  useEffect(() => {
    loadOrderOptions()
  }, [loadOrderOptions])

  const handleGenerate = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      if (!generateForm.orderId) {
        throw new Error('Please select an order to generate bill.')
      }

      await billsApi.generate(token, {
        orderId: generateForm.orderId,
        paymentMethod: generateForm.paymentMethod,
        paymentStatus: generateForm.paymentStatus,
      })

      setSuccess('Bill generated successfully.')
      setGenerateForm({
        orderId: '',
        paymentMethod: 'Offline',
        paymentStatus: 'Pending',
      })
      await loadBills()
    } catch (err) {
      const fieldErrors = formatFieldErrors(err.fieldErrors)
      setError(fieldErrors[0] ?? getErrorMessage(err, 'Unable to generate bill.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (billId, currentStatus) => {
    const paymentStatus = statusDrafts[billId] ?? currentStatus
    setUpdating(true)
    setError('')
    setSuccess('')

    try {
      await billsApi.updateStatus(token, billId, { paymentStatus })
      setSuccess('Bill status updated successfully.')
      await loadBills()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update bill status.'))
    } finally {
      setUpdating(false)
    }
  }

  const handleRecordPayment = async (billId) => {
    const amountRaw = paymentDrafts[billId]
    const amount = Number(amountRaw)

    if (!amount || amount <= 0) {
      setError('Enter a valid payment amount greater than zero.')
      return
    }

    setUpdating(true)
    setError('')
    setSuccess('')

    try {
      await billsApi.recordPayment(token, billId, { amount })
      setSuccess('Payment recorded successfully.')
      setPaymentDrafts((prev) => ({ ...prev, [billId]: '' }))
      await loadBills()
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to record payment.'))
    } finally {
      setUpdating(false)
    }
  }

  const handleDownload = async (billId) => {
    setError('')

    try {
      const { blob, filename } = await billsApi.download(token, billId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setSuccess('Bill download started.')
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to download bill.'))
    }
  }

  const handleDetails = async (billId) => {
    setError('')

    try {
      const response = await billsApi.getById(token, billId)
      setSelectedBill(mapBill(response))
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load bill details.'))
    }
  }

  const billRows = useMemo(() => bills, [bills])

  return (
    <section>
      <PageHeader
        title="Bills"
        description="Generate invoices, track payment status, and record partial payments."
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
            <label htmlFor="paymentMethodFilter">Payment Method</label>
            <input
              id="paymentMethodFilter"
              value={paymentMethodFilter}
              onChange={(event) => {
                setPaymentMethodFilter(event.target.value)
                setPage(1)
              }}
              placeholder="Offline / Invoiced"
            />
          </div>

          <div className="form-field">
            <label htmlFor="paymentStatusFilter">Payment Status</label>
            <select
              id="paymentStatusFilter"
              value={paymentStatusFilter}
              onChange={(event) => {
                setPaymentStatusFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
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
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="inline-actions align-end">
            <button type="button" className="btn btn-outline" onClick={loadBills}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleGenerate}>
        <h3>Generate Bill</h3>

        <div className="grid-three">
          <div className="form-field">
            <label htmlFor="orderId">Order</label>
            <select
              id="orderId"
              value={generateForm.orderId}
              onChange={(event) =>
                setGenerateForm((prev) => ({ ...prev, orderId: event.target.value }))
              }
              required
            >
              <option value="">Select order</option>
              {orderOptions.map((order) => {
                const id = field(order, 'id')
                const customerName = field(order, 'customerName') ?? '-'
                const agencyName = field(order, 'agencyName') ?? '-'

                return (
                  <option key={id} value={id}>
                    {id} | Customer: {customerName} | Agency: {agencyName}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="paymentMethod">Payment Method</label>
            <input
              id="paymentMethod"
              value={generateForm.paymentMethod}
              onChange={(event) =>
                setGenerateForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
              }
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="paymentStatus">Payment Status</label>
            <select
              id="paymentStatus"
              value={generateForm.paymentStatus}
              onChange={(event) =>
                setGenerateForm((prev) => ({ ...prev, paymentStatus: event.target.value }))
              }
            >
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Generating...' : 'Generate Bill'}
        </button>
      </form>

      <div className="panel">
        <h3>Bill List</h3>
        {loading ? (
          <p>Loading bills...</p>
        ) : billRows.length === 0 ? (
          <p className="empty-state">No bills found.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bill Number</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billRows.map((bill) => (
                    <tr key={bill.id}>
                      <td>{bill.billNumber}</td>
                      <td>{bill.customerName || '-'}</td>
                      <td>{bill.amount.toFixed(2)}</td>
                      <td>{bill.paidAmount.toFixed(2)}</td>
                      <td>{bill.balanceAmount.toFixed(2)}</td>
                      <td>
                        <select
                          value={statusDrafts[bill.id] ?? bill.paymentStatus}
                          onChange={(event) =>
                            setStatusDrafts((prev) => ({
                              ...prev,
                              [bill.id]: event.target.value,
                            }))
                          }
                        >
                          {PAYMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="stack-actions">
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleDetails(bill.id)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleDownload(bill.id)}
                            >
                              Download
                            </button>
                          </div>

                          <div className="inline-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleUpdateStatus(bill.id, bill.paymentStatus)}
                              disabled={updating}
                            >
                              Update Status
                            </button>
                          </div>

                          <div className="inline-actions">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={paymentDrafts[bill.id] ?? ''}
                              onChange={(event) =>
                                setPaymentDrafts((prev) => ({
                                  ...prev,
                                  [bill.id]: event.target.value,
                                }))
                              }
                              placeholder="Payment amount"
                            />
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => handleRecordPayment(bill.id)}
                              disabled={updating}
                            >
                              Record Payment
                            </button>
                          </div>
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

      {selectedBill ? (
        <div className="panel">
          <h3>Bill Details</h3>
          <div className="meta-grid">
            <span>ID: {selectedBill.id}</span>
            <span>Bill Number: {selectedBill.billNumber}</span>
            <span>Order ID: {selectedBill.orderId}</span>
            <span>Customer: {selectedBill.customerName || '-'}</span>
            <span>Amount: {selectedBill.amount.toFixed(2)}</span>
            <span>Paid: {selectedBill.paidAmount.toFixed(2)}</span>
            <span>Balance: {selectedBill.balanceAmount.toFixed(2)}</span>
            <span>Payment Method: {selectedBill.paymentMethod}</span>
            <span>Status: {selectedBill.paymentStatus}</span>
            <span>
              Created: {selectedBill.createdAt ? new Date(selectedBill.createdAt).toLocaleString() : '-'}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
