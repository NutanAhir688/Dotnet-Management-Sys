namespace InventoryManagement.API.DTOs;

public record AgencyRequest(string Name, string Address, string Phone, string TaxId);

public record AgencyResponse(
    Guid Id,
    string Name,
    string Address,
    string Phone,
    string TaxId,
    DateTime CreatedAt
);
