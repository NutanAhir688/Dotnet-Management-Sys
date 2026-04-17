export function PaginationControls({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}) {
  if (!totalPages || totalPages <= 1) {
    return null
  }

  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn-outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>

      <span className="pagination-meta">
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        className="btn btn-outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>

      {typeof totalCount === 'number' ? (
        <span className="pagination-total">
          {totalCount} total items ({pageSize}/page)
        </span>
      ) : null}
    </div>
  )
}
