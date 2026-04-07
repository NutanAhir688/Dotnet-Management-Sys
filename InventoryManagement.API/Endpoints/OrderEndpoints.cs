using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace InventoryManagement.API.Endpoints;

public static class OrderEndpoints
{
    public static void MapOrderEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/orders")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Orders")
                       .RequireAuthorization()
                       .HasApiVersion(1.0)
                       .RequireRateLimiting("fixed");

        // GET all orders
        group.MapGet("/", async (
            AppDbContext context,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] Guid? customerId = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? sortOrder = "desc",
            ClaimsPrincipal userClaims = null!) =>
        {
            var query = context.Orders
                .Include(o => o.Customer)
                .Include(o => o.Agency)
                .Include(o => o.ShopkeeperUser)
                .Include(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .AsQueryable();

            if (userClaims != null)
            {
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Agency)
            {
                var aid = userClaims.FindFirstValue("agency_id");
                if (Guid.TryParse(aid, out Guid agencyGuid))
                {
                    query = query.Where(o => o.AgencyId == agencyGuid);
                }
                else
                {
                    query = query.Where(o => false);
                }
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(sidString, out Guid sidGuid))
                {
                    query = query.Where(o => o.ShopkeeperUserId == sidGuid);
                }
            }
            // Admin sees all by default, no filtering needed here.
            }

            if (customerId.HasValue)
                query = query.Where(o => o.CustomerId == customerId.Value);
            if (fromDate.HasValue)
                query = query.Where(o => o.OrderDate >= fromDate.Value);
            if (toDate.HasValue)
                query = query.Where(o => o.OrderDate <= toDate.Value);

            query = sortOrder == "asc" ? query.OrderBy(o => o.OrderDate) : query.OrderByDescending(o => o.OrderDate);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);
            var orders = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

            var data = orders.Select(o => new OrderResponse(
                o.Id, o.CustomerId, o.Customer?.Name, o.AgencyId, o.Agency?.Name, o.ShopkeeperUserId, o.ShopkeeperUser?.Username,
                o.OrderDate, o.TotalAmount, o.TaxAmount, o.Status,
                o.OrderItems.Select(oi => new OrderItemResponse(oi.Id, oi.ProductId, oi.Product.Name, oi.Quantity, oi.UnitPrice, oi.TotalPrice)).ToList()
            )).ToList();

            return Results.Ok(new PaginatedResponse<OrderResponse>(data, page, pageSize, totalCount, totalPages));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(15)));

        // GET single order
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var order = await context.Orders
                .Include(o => o.Customer)
                .Include(o => o.Agency)
                .Include(o => o.ShopkeeperUser)
                .Include(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order is null) return Results.NotFound(new { error = "Order not found" });

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

            return Results.Ok(new OrderResponse(
                order.Id, order.CustomerId, order.Customer?.Name, order.AgencyId, order.Agency?.Name, order.ShopkeeperUserId, order.ShopkeeperUser?.Username,
                order.OrderDate, order.TotalAmount, order.TaxAmount, order.Status,
                order.OrderItems.Select(oi => new OrderItemResponse(oi.Id, oi.ProductId, oi.Product.Name, order.OrderItems.FirstOrDefault(x => x.Id == oi.Id)?.Quantity ?? 0, order.OrderItems.FirstOrDefault(x => x.Id == oi.Id)?.UnitPrice ?? 0, order.OrderItems.FirstOrDefault(x => x.Id == oi.Id)?.TotalPrice ?? 0)).ToList()
            ));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(15)));

        // POST create sale (B2C)
        group.MapPost("/sale", async (
            [FromBody] CreateSalesOrderRequest request,
            AppDbContext context,
            IValidator<CreateSalesOrderRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var customer = await context.Customers.FindAsync(request.CustomerId);
            if (customer is null) return Results.NotFound(new { error = "Customer not found" });

            Guid? sidGuid = null;
            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            
            if (isAdmin)
            {
                sidGuid = request.ShopkeeperUserId;
            }
            else
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                sidGuid = Guid.TryParse(sidString, out Guid guid) ? guid : null;
            }

            decimal totalAmount = 0;
            var orderItems = new List<OrderItem>();

            foreach (var itemReq in request.Items)
            {
                var product = await context.Products.FindAsync(itemReq.ProductId);
                if (product is null) return Results.BadRequest(new { error = $"Product {itemReq.ProductId} not found." });
                
                // SHOPKEEPER OWNERSHIP VALIDATION
                if (product.ShopkeeperUserId != sidGuid)
                    return Results.BadRequest(new { error = $"Product '{product.Name}' does not belong to your inventory and cannot be sold." });

                if (product.StockQuantity < itemReq.Quantity)
                    return Results.BadRequest(new { error = $"Product '{product.Name}' has only {product.StockQuantity} in stock." });

                var totalPrice = product.Price * itemReq.Quantity;
                totalAmount += totalPrice;

                orderItems.Add(new OrderItem { ProductId = product.Id, Quantity = itemReq.Quantity, UnitPrice = product.Price, TotalPrice = totalPrice });
                product.StockQuantity -= itemReq.Quantity;
            }

            var order = new Order
            {
                CustomerId = request.CustomerId,
                ShopkeeperUserId = sidGuid,
                OrderDate = DateTime.UtcNow,
                TotalAmount = totalAmount,
                TaxAmount = totalAmount * 0.1m,
                Status = "Pending",
                OrderItems = orderItems
            };

            context.Orders.Add(order);

            // Auto-generate bill for customer sales
            var bill = new Bill
            {
                OrderId = order.Id,
                CustomerId = order.CustomerId,
                BillNumber = $"BILL-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString()[..4].ToUpper()}",
                Amount = totalAmount + (totalAmount * 0.1m),
                PaymentMethod = "Offline",
                PaymentStatus = "Pending"
            };
            context.Bills.Add(bill);

            await context.SaveChangesAsync();

            return Results.Created($"/api/v1/orders/{order.Id}", new OrderResponse(
                order.Id, order.CustomerId, customer?.Name, null, null, order.ShopkeeperUserId,
                userClaims.Identity?.Name, order.OrderDate, order.TotalAmount, order.TaxAmount, order.Status,
                orderItems.Select(oi => new OrderItemResponse(oi.Id, oi.ProductId, context.Products.Find(oi.ProductId)?.Name ?? "Unknown", oi.Quantity, oi.UnitPrice, oi.TotalPrice)).ToList()
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper));

        // POST create restock (B2B)
        group.MapPost("/restock", async (
            [FromBody] CreateRestockOrderRequest request,
            AppDbContext context,
            IValidator<CreateRestockOrderRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var agency = await context.Agencies.FindAsync(request.AgencyId);
            if (agency is null) return Results.NotFound(new { error = "Agency not found" });

            Guid? sidGuid = null;
            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            
            if (isAdmin)
            {
                sidGuid = request.ShopkeeperUserId;
            }
            else
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                sidGuid = Guid.TryParse(sidString, out Guid guid) ? guid : null;
            }

            decimal totalAmount = 0;
            var orderItems = new List<OrderItem>();

            foreach (var itemReq in request.Items)
            {
                var product = await context.Products.FindAsync(itemReq.ProductId);
                if (product is null) return Results.BadRequest(new { error = $"Product {itemReq.ProductId} not found." });
                
                // AGENCY OWNERSHIP VALIDATION
                if (product.AgencyId != request.AgencyId)
                    return Results.BadRequest(new { error = $"Product '{product.Name}' does not belong to Agency '{agency.Name}'." });
                
                var totalPrice = product.Price * itemReq.Quantity;
                totalAmount += totalPrice;

                orderItems.Add(new OrderItem { ProductId = product.Id, Quantity = itemReq.Quantity, UnitPrice = product.Price, TotalPrice = totalPrice });
            }

            var order = new Order
            {
                AgencyId = request.AgencyId,
                ShopkeeperUserId = sidGuid,
                OrderDate = DateTime.UtcNow,
                TotalAmount = totalAmount,
                TaxAmount = totalAmount * 0.1m,
                Status = "Pending",
                OrderItems = orderItems
            };

            context.Orders.Add(order);
            await context.SaveChangesAsync();

            return Results.Created($"/api/v1/orders/{order.Id}", new OrderResponse(
                order.Id, null, null, order.AgencyId, agency?.Name, order.ShopkeeperUserId,
                userClaims.Identity?.Name, order.OrderDate, order.TotalAmount, order.TaxAmount, order.Status,
                orderItems.Select(oi => new OrderItemResponse(oi.Id, oi.ProductId, context.Products.Find(oi.ProductId)?.Name ?? "Unknown", oi.Quantity, oi.UnitPrice, oi.TotalPrice)).ToList()
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper));

        // PUT update order status
        group.MapPut("/{id:guid}/status", async (
            Guid id,
            [FromBody] UpdateOrderStatusRequest request,
            AppDbContext context,
            ClaimsPrincipal userClaims) =>
        {
            var order = await context.Orders
                .Include(o => o.Customer)
                .Include(o => o.Agency)
                .Include(o => o.ShopkeeperUser)
                .Include(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order is null) return Results.NotFound(new { error = "Order not found" });

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

                if (request.Status != "Rejected")
                    return Results.BadRequest(new { error = "Shopkeeper can only cancel (Reject) their own pending orders." });
            }

            var allowedStatuses = new[] { "Pending", "Accepted", "Shipped", "Delivered", "Rejected" };
            if (!allowedStatuses.Contains(request.Status))
                return Results.BadRequest(new { error = "Invalid status." });

            string oldStatus = order.Status;
            order.Status = request.Status;

            // Trigger bill generation for Restock Orders on "Accepted" only if not already exists
            if (oldStatus != "Accepted" && request.Status == "Accepted" && order.AgencyId.HasValue)
            {
                var existingBill = await context.Bills.FirstOrDefaultAsync(b => b.OrderId == order.Id);
                if (existingBill == null)
                {
                    var bill = new Bill
                    {
                        OrderId = order.Id,
                        CustomerId = null, // Restock order doesn't have a retail customer
                        BillNumber = $"RESTOCK-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString()[..4].ToUpper()}",
                        Amount = order.TotalAmount + order.TaxAmount,
                        PaymentMethod = "Invoiced",
                        PaymentStatus = "Pending"
                    };
                    context.Bills.Add(bill);
                }
            }

            // For "Rejected", ensure no bill is created
            if (request.Status == "Rejected" && order.AgencyId.HasValue)
            {
                var existingBill = await context.Bills.FirstOrDefaultAsync(b => b.OrderId == order.Id);
                if (existingBill != null)
                {
                    context.Bills.Remove(existingBill); // Remove any existing bill on rejection
                }
            }

            if (oldStatus != "Delivered" && request.Status == "Delivered")
            {
                // Sales orders might still need their bill here if not generated yet, 
                // but restock bills are now generated on 'Accepted'.
                var existingBill = await context.Bills.FirstOrDefaultAsync(b => b.OrderId == order.Id);
                if (existingBill == null)
                {
                    var bill = new Bill
                    {
                        OrderId = order.Id,
                        CustomerId = order.CustomerId,
                        BillNumber = $"BILL-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString()[..4].ToUpper()}",
                        Amount = order.TotalAmount + order.TaxAmount,
                        PaymentMethod = "Offline",
                        PaymentStatus = "Pending"
                    };
                    context.Bills.Add(bill);
                }

                if (order.AgencyId.HasValue && order.ShopkeeperUserId.HasValue)
                {
                    foreach (var item in order.OrderItems)
                    {
                        var shopkeeperProduct = await context.Products
                            .FirstOrDefaultAsync(p => p.ShopkeeperUserId == order.ShopkeeperUserId && p.Id == item.ProductId);

                        if (shopkeeperProduct != null)
                            shopkeeperProduct.StockQuantity += item.Quantity;
                        else
                            context.Products.Add(new Product
                            {
                                ShopkeeperUserId = order.ShopkeeperUserId,
                                Name = item.Product.Name,
                                Description = item.Product.Description,
                                Price = item.Product.Price,
                                StockQuantity = item.Quantity
                            });
                    }
                }
            }

            await context.SaveChangesAsync();

            return Results.Ok(new OrderResponse(
                order.Id, order.CustomerId, order.Customer?.Name, order.AgencyId, order.Agency?.Name, order.ShopkeeperUserId, order.ShopkeeperUser?.Username,
                order.OrderDate, order.TotalAmount, order.TaxAmount, order.Status,
                order.OrderItems.Select(oi => new OrderItemResponse(oi.Id, oi.ProductId, oi.Product.Name, oi.Quantity, oi.UnitPrice, oi.TotalPrice)).ToList()
            ));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Agency, RoleConstants.Shopkeeper));
    }
}
