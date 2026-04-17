export function field(objectValue, key) {
  if (!objectValue || typeof objectValue !== 'object') {
    return undefined
  }

  if (objectValue[key] !== undefined) {
    return objectValue[key]
  }

  const pascalCaseKey = `${key.charAt(0).toUpperCase()}${key.slice(1)}`
  if (objectValue[pascalCaseKey] !== undefined) {
    return objectValue[pascalCaseKey]
  }

  return undefined
}

export function normalizePagedResponse(response) {
  return {
    data: field(response, 'data') ?? [],
    page: Number(field(response, 'page') ?? 1),
    pageSize: Number(field(response, 'pageSize') ?? 10),
    totalCount: Number(field(response, 'totalCount') ?? 0),
    totalPages: Number(field(response, 'totalPages') ?? 1),
  }
}
