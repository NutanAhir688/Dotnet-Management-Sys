using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace InventoryManagement.API.Endpoints;

public static class BillEndpoints
{
    public static void MapBillEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/bills")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Bills")
                       .RequireAuthorization()
                       .HasApiVersion(1.0)
                       .RequireRateLimiting("fixed");

        // GET all bills
        group.MapGet("/", async (
            AppDbContext context,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] Guid? customerId = null,
            [FromQuery] string? paymentMethod = null,
            [FromQuery] string? paymentStatus = null,
            [FromQuery] string? sortOrder = "desc",
            ClaimsPrincipal userClaims = null!) =>
        {
            var query = context.Bills.Include(b => b.Customer).Include(b => b.Order).AsQueryable();

            if (userClaims != null)
            {
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Agency)
            {
                var aid = userClaims.FindFirstValue("agency_id");
                if (Guid.TryParse(aid, out Guid agencyGuid))
                {
                    query = query.Where(b => b.Order.AgencyId == agencyGuid);
                }
                else
                {
                    query = query.Where(b => false);
                }
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(sidString, out Guid sidGuid))
                {
                    query = query.Where(b => b.Order.ShopkeeperUserId == sidGuid);
                }
            }
            // Admin sees all bills.
            }

            if (customerId.HasValue)
                query = query.Where(b => b.CustomerId == customerId.Value);
            if (!string.IsNullOrWhiteSpace(paymentMethod))
                query = query.Where(b => b.PaymentMethod == paymentMethod);
            if (!string.IsNullOrWhiteSpace(paymentStatus))
                query = query.Where(b => b.PaymentStatus == paymentStatus);

            query = sortOrder == "asc"
                ? query.OrderBy(b => b.CreatedAt)
                : query.OrderByDescending(b => b.CreatedAt);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var bills = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
            var data = bills.Select(b => new BillResponse(
                b.Id, b.BillNumber, b.OrderId, b.CustomerId, b.Customer?.Name, b.Amount, b.PaidAmount, b.BalanceAmount, b.PaymentMethod, b.PaymentStatus, b.CreatedAt
            )).ToList();

            return Results.Ok(new PaginatedResponse<BillResponse>(data, page, pageSize, totalCount, totalPages));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(15)));

        // GET single bill
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var bill = await context.Bills.Include(b => b.Customer).Include(b => b.Order).FirstOrDefaultAsync(b => b.Id == id);
            if (bill is null) return Results.NotFound(new { error = "Bill not found" });

            if (userClaims != null)
            {
                var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
                if (userRole == RoleConstants.Agency)
                {
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (bill.Order?.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Bill not found" });
                }
                else if (userRole == RoleConstants.Shopkeeper)
                {
                    var sid = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (bill.Order?.ShopkeeperUserId?.ToString() != sid) return Results.NotFound(new { error = "Bill not found" });
                }
            }
            return Results.Ok(new BillResponse(
                bill.Id, bill.BillNumber, bill.OrderId, bill.CustomerId, bill.Customer?.Name, bill.Amount, bill.PaidAmount, bill.BalanceAmount, bill.PaymentMethod, bill.PaymentStatus, bill.CreatedAt
            ));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(15)));

        // POST generate bill
        group.MapPost("/", async (
            [FromBody] GenerateBillRequest request,
            AppDbContext context,
            IValidator<GenerateBillRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var order = await context.Orders
                .Include(o => o.Customer)
                .Include(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == request.OrderId);
            if (order is null) return Results.NotFound(new { error = "Order not found" });

            // Check for existing bill
            var existingBill = await context.Bills.FirstOrDefaultAsync(b => b.OrderId == order.Id);
            if (existingBill != null) 
            {
                // Instead of Conflict, return the existing bill to avoid UI errors
                return Results.Ok(new BillResponse(
                    existingBill.Id, existingBill.BillNumber, existingBill.OrderId, existingBill.CustomerId, order.Customer?.Name, 
                    existingBill.Amount, existingBill.PaidAmount, existingBill.BalanceAmount, 
                    existingBill.PaymentMethod, existingBill.PaymentStatus, existingBill.CreatedAt
                ));
            }

            if (userClaims != null)
            {
                var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
                if (userRole == RoleConstants.Agency)
                {
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (order.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Order not found" });
                }
                else if (userRole == RoleConstants.Shopkeeper)
                {
                    var sid = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (order.ShopkeeperUserId?.ToString() != sid) return Results.NotFound(new { error = "Order not found" });
                }
            }

            var bill = new Bill
            {
                OrderId = order.Id,
                CustomerId = order.CustomerId,
                BillNumber = $"BILL-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString()[..4].ToUpper()}",
                Amount = order.TotalAmount + order.TaxAmount,
                PaymentMethod = request.PaymentMethod,
                PaymentStatus = request.PaymentStatus
            };

            context.Bills.Add(bill);
            await context.SaveChangesAsync();

            return Results.Created($"/api/v1/bills/{bill.Id}", new BillResponse(
                bill.Id, bill.BillNumber, bill.OrderId, bill.CustomerId, order.Customer?.Name, bill.Amount, bill.PaidAmount, bill.BalanceAmount, bill.PaymentMethod, bill.PaymentStatus, bill.CreatedAt
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));

        // GET download bill
        group.MapGet("/{id:guid}/download", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var bill = await context.Bills
                .Include(b => b.Customer)
                .Include(b => b.Order).ThenInclude(o => o.Agency)
                .Include(b => b.Order).ThenInclude(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(b => b.Id == id);

            if (bill is null) return Results.NotFound(new { error = "Bill not found" });

            if (userClaims != null)
            {
                var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
                if (userRole == RoleConstants.Agency)
                {
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (bill.Order?.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Bill not found" });
                }
                else if (userRole == RoleConstants.Shopkeeper)
                {
                    var sid = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (bill.Order?.ShopkeeperUserId?.ToString() != sid) return Results.NotFound(new { error = "Bill not found" });
                }
            }

            var sb = new StringBuilder();
            sb.AppendLine("╔══════════════════════════════════════════════════════════╗");
            sb.AppendLine("║             INVENTORY MANAGEMENT SYSTEM                 ║");
            sb.AppendLine("║                    INVOICE / BILL                       ║");
            sb.AppendLine("╠══════════════════════════════════════════════════════════╣");
            if (bill.Order?.Agency != null)
            {
                sb.AppendLine($"║  Agency        : {bill.Order.Agency.Name,-39}║");
                sb.AppendLine($"║  Agency Phone  : {bill.Order.Agency.Phone,-39}║");
                sb.AppendLine("╠══════════════════════════════════════════════════════════╣");
            }
            sb.AppendLine($"║  Bill Number   : {bill.BillNumber,-39}║");
            sb.AppendLine($"║  Date          : {bill.CreatedAt:yyyy-MM-dd HH:mm:ss,-39}║");
            sb.AppendLine($"║  Customer      : {(bill.Customer?.Name ?? "-"),-39}║");
            sb.AppendLine($"║  Email         : {(bill.Customer?.Email ?? "-"),-39}║");
            sb.AppendLine($"║  Phone         : {(bill.Customer?.Phone ?? "-"),-39}║");
            sb.AppendLine("╠══════════════════════════════════════════════════════════╣");
            sb.AppendLine("║  ITEMS                                                  ║");
            sb.AppendLine("╠════════════════════════╦═══════╦═══════════╦════════════╣");
            sb.AppendLine("║  Product               ║  Qty  ║ Unit Price║   Total    ║");
            sb.AppendLine("╠════════════════════════╬═══════╬═══════════╬════════════╣");

            foreach (var item in bill.Order?.OrderItems ?? new List<OrderItem>())
            {
                var name = item.Product.Name.Length > 20 ? item.Product.Name[..20] : item.Product.Name;
                sb.AppendLine($"║  {name,-22}║  {item.Quantity,-5}║ {item.UnitPrice,9:F2} ║ {item.TotalPrice,10:F2} ║");
            }

            sb.AppendLine("╠════════════════════════╩═══════╩═══════════╬════════════╣");
            sb.AppendLine($"║                              Subtotal     ║ {bill.Order?.TotalAmount ?? 0,10:F2} ║");
            sb.AppendLine($"║                              Tax (10%)    ║ {bill.Order?.TaxAmount ?? 0,10:F2} ║");
            sb.AppendLine($"║                              GRAND TOTAL  ║ {bill.Amount,10:F2} ║");
            sb.AppendLine($"║                              PAID AMOUNT  ║ {bill.PaidAmount,10:F2} ║");
            sb.AppendLine($"║                              BALANCE      ║ {bill.BalanceAmount,10:F2} ║");
            sb.AppendLine("╠════════════════════════════════════════════╬════════════╣");
            sb.AppendLine($"║  Payment Method : {bill.PaymentMethod,-24}║            ║");
            sb.AppendLine($"║  Payment Status : {bill.PaymentStatus,-24}║            ║");
            sb.AppendLine("╚════════════════════════════════════════════╩════════════╝");
            sb.AppendLine();
            sb.AppendLine("                    Thank you for your business!");

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return Results.File(bytes, "text/plain", $"{bill.BillNumber}.txt");
        });

        // PUT update bill status
        group.MapPut("/{id:guid}/status", async (
            Guid id,
            [FromBody] UpdateBillStatusRequest request,
            AppDbContext context,
            ClaimsPrincipal userClaims) =>
        {
            var bill = await context.Bills.Include(b => b.Customer).Include(b => b.Order).FirstOrDefaultAsync(b => b.Id == id);
            if (bill is null) return Results.NotFound(new { error = "Bill not found" });

            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            
            if (!isAdmin)
            {
                bool isRestockOrder = bill.Order?.AgencyId != null;

                if (isRestockOrder)
                {
                    // Only Admin and Agency can manage payments/status for a Restock (B2B) bill
                    if (userRole != RoleConstants.Agency) 
                        return Results.Forbid();
                        
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (bill.Order?.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Bill not found" });
                }
                else
                {
                    // For Sales (B2C) bills, Admin and Shopkeeper manage them
                    if (userRole != RoleConstants.Shopkeeper)
                        return Results.Forbid();
                        
                    var sid = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (bill.Order?.ShopkeeperUserId?.ToString() != sid) return Results.NotFound(new { error = "Bill not found" });
                }
            }

            if (request.PaymentStatus != "Pending" && request.PaymentStatus != "Partial" && request.PaymentStatus != "Completed" && request.PaymentStatus != "Failed")
                return Results.BadRequest(new { error = "PaymentStatus must be Pending, Partial, Completed, or Failed." });

            bill.PaymentStatus = request.PaymentStatus;
            await context.SaveChangesAsync();

            return Results.Ok(new BillResponse(
                bill.Id, bill.BillNumber, bill.OrderId, bill.CustomerId, bill.Customer?.Name, bill.Amount, bill.PaidAmount, bill.BalanceAmount, bill.PaymentMethod, bill.PaymentStatus, bill.CreatedAt
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));

        // PUT record partial payment
        group.MapPut("/{id:guid}/payment", async (
            Guid id,
            [FromBody] RecordPaymentRequest request,
            AppDbContext context,
            ClaimsPrincipal userClaims) =>
        {
            var bill = await context.Bills.Include(b => b.Customer).Include(b => b.Order).FirstOrDefaultAsync(b => b.Id == id);
            if (bill is null) return Results.NotFound(new { error = "Bill not found" });

            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            
            if (!isAdmin)
            {
                bool isRestockOrder = bill.Order?.AgencyId != null;

                if (isRestockOrder)
                {
                    // Recipient (Agency) manages incoming payments
                    if (userRole != RoleConstants.Agency) 
                        return Results.Forbid();
                        
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (bill.Order?.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Bill not found" });
                }
                else
                {
                    // Shopkeeper manages their customer payments
                    if (userRole != RoleConstants.Shopkeeper)
                        return Results.Forbid();
                        
                    var sid = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (bill.Order?.ShopkeeperUserId?.ToString() != sid) return Results.NotFound(new { error = "Bill not found" });
                }
            }

            if (request.Amount <= 0)
                return Results.BadRequest(new { error = "Payment amount must be greater than zero." });

            if (request.Amount > bill.BalanceAmount)
                return Results.BadRequest(new { error = $"Payment amount ({request.Amount}) cannot exceed the balance ({bill.BalanceAmount})." });

            bill.PaidAmount += request.Amount;

            if (bill.BalanceAmount <= 0)
                bill.PaymentStatus = "Completed";
            else if (bill.PaidAmount > 0)
                bill.PaymentStatus = "Partial";

            await context.SaveChangesAsync();

            return Results.Ok(new BillResponse(
                bill.Id, bill.BillNumber, bill.OrderId, bill.CustomerId, bill.Customer?.Name, bill.Amount, bill.PaidAmount, bill.BalanceAmount, bill.PaymentMethod, bill.PaymentStatus, bill.CreatedAt
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));
    }
}
