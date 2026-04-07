namespace InventoryManagement.API.DTOs;

public record OrderItemRequest(Guid ProductId, int Quantity);

public record CreateSalesOrderRequest(Guid CustomerId, List<OrderItemRequest> Items, Guid? ShopkeeperUserId = null);

public record CreateRestockOrderRequest(Guid AgencyId, List<OrderItemRequest> Items, Guid? ShopkeeperUserId = null);

public record OrderItemResponse(
    Guid Id,
    Guid ProductId,
    string ProductName,
    int Quantity,
    decimal UnitPrice,
    decimal TotalPrice
);

public record OrderResponse(
    Guid Id,
    Guid? CustomerId,
    string? CustomerName,
    Guid? AgencyId,
    string? AgencyName,
    Guid? ShopkeeperUserId,
    string? ShopkeeperName,
    DateTime OrderDate,
    decimal TotalAmount,
    decimal TaxAmount,
    string Status,
    List<OrderItemResponse> Items
);

public record UpdateOrderStatusRequest(string Status);
