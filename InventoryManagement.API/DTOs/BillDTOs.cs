namespace InventoryManagement.API.DTOs;

public record GenerateBillRequest(Guid OrderId, string PaymentMethod, string PaymentStatus);

public record BillResponse(
    Guid Id,
    string BillNumber,
    Guid OrderId,
    Guid? CustomerId,
    string? CustomerName,
    decimal Amount,
    decimal PaidAmount,
    decimal BalanceAmount,
    string PaymentMethod,
    string PaymentStatus,
    DateTime CreatedAt
);

public record UpdateBillStatusRequest(string PaymentStatus);

public record RecordPaymentRequest(decimal Amount);
