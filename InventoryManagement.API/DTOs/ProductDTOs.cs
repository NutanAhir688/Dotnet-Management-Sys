namespace InventoryManagement.API.DTOs;

public record ProductResponse(
    Guid Id,
    string Name,
    string Description,
    decimal Price,
    int StockQuantity,
    Guid? AgencyId,
    Guid? ShopkeeperUserId,
    string OwnerType = "System",
    string OwnerName = "System"
);

public record CreateProductRequest(string Name, string Description, decimal Price, int StockQuantity, Guid? AgencyId = null, Guid? ShopkeeperUserId = null);

public record UpdateProductRequest(string Name, string Description, decimal Price, int StockQuantity, Guid? AgencyId = null, Guid? ShopkeeperUserId = null);
