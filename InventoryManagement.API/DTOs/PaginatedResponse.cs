namespace InventoryManagement.API.DTOs;

public record PaginatedResponse<T>(
    List<T> Data,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages
);
