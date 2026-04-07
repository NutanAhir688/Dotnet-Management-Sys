namespace InventoryManagement.API.DTOs;

public record CustomerResponse(
    Guid Id,
    string Name,
    string Email,
    string Phone,
    Guid? ShopkeeperUserId = null,
    string? ShopkeeperName = null
);

public record CreateCustomerRequest(string Name, string Email, string Phone, Guid? ShopkeeperUserId = null);

public record UpdateCustomerRequest(string Name, string Email, string Phone, Guid? ShopkeeperUserId = null);
