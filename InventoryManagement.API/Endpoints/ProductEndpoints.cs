using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace InventoryManagement.API.Endpoints;

public static class ProductEndpoints
{
    public static void MapProductEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/products")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Products")
                       .RequireAuthorization()
                       .HasApiVersion(1.0)
                       .RequireRateLimiting("fixed");

        // GET all products
        group.MapGet("/", async (
            AppDbContext context,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null,
            [FromQuery] string? sortBy = "Name",
            [FromQuery] string? sortOrder = "asc",
            [FromQuery] Guid? agencyId = null,
            [FromQuery] Guid? shopkeeperId = null,
            ClaimsPrincipal userClaims = null!) =>
        {
            var query = context.Products.AsQueryable();
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            
            if (userRole == RoleConstants.Agency)
            {
                var userAgencyId = userClaims.FindFirstValue("agency_id");
                if (Guid.TryParse(userAgencyId, out Guid aid))
                {
                    query = query.Where(p => p.AgencyId == aid);
                }
                else
                {
                    query = query.Where(p => false);
                }
            }
            
            if (userRole == RoleConstants.Shopkeeper)
            {
                var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(userIdString, out Guid sidGuid))
                {
                    // Shopkeepers see products ONLY from agencies they have 'Attached' (linked) or own
                    var linkedAgencyIds = await context.ShopkeeperSuppliers
                        .Where(s => s.ShopkeeperUserId == sidGuid)
                        .Select(s => s.AgencyId)
                        .ToListAsync();

                    // Improved filtering to avoid unnecessary navigation properties that trigger EF warnings
                    query = query.Where(p => 
                        (p.ShopkeeperUserId == sidGuid) || 
                        (p.AgencyId.HasValue && linkedAgencyIds.Contains(p.AgencyId.Value)) ||
                        (p.AgencyId == null && p.ShopkeeperUserId == null) // Shared system items (System owner)
                    );
                }
            }

            if (agencyId.HasValue)
                query = query.Where(p => p.AgencyId == agencyId.Value);

            if (shopkeeperId.HasValue)
                query = query.Where(p => p.ShopkeeperUserId == shopkeeperId.Value);

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(p => p.Name.Contains(search) || p.Description.Contains(search));

            query = sortBy?.ToLower() switch
            {
                "price" => sortOrder == "desc" ? query.OrderByDescending(p => p.Price) : query.OrderBy(p => p.Price),
                "stock" => sortOrder == "desc" ? query.OrderByDescending(p => p.StockQuantity) : query.OrderBy(p => p.StockQuantity),
                _ => sortOrder == "desc" ? query.OrderByDescending(p => p.Name) : query.OrderBy(p => p.Name)
            };

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var products = await query.Skip((page - 1) * pageSize).Take(pageSize)
                .Include(p => p.Agency)
                .Include(p => p.ShopkeeperUser)
                .ToListAsync();
                
            var response = new PaginatedResponse<ProductResponse>(
                products.Select(p => new ProductResponse(
                    p.Id, p.Name, p.Description, p.Price, p.StockQuantity, p.AgencyId, p.ShopkeeperUserId,
                    p.AgencyId.HasValue ? "Agency" : (p.ShopkeeperUserId.HasValue ? "Shopkeeper" : "System"),
                    p.AgencyId.HasValue ? p.Agency?.Name ?? "Unknown" : (p.ShopkeeperUserId.HasValue ? p.ShopkeeperUser?.Username ?? "Unknown" : "System")
                )).ToList(),
                page, pageSize, totalCount, totalPages
            );
            return Results.Ok(response);
        });

        // GET single product
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var product = await context.Products
                .Include(p => p.Agency)
                .Include(p => p.ShopkeeperUser)
                .FirstOrDefaultAsync(p => p.Id == id);
                
            if (product is null) return Results.NotFound(new { error = "Product not found" });

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Agency)
            {
                var aid = userClaims.FindFirstValue("agency_id");
                if (product.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Product not found" });
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                // Shopkeepers can see their own, agency items, and system items. 
                // They can NOT see products belonging to OTHER shopkeepers.
                if (!Guid.TryParse(sidString, out Guid sid) || (product.ShopkeeperUserId != null && product.ShopkeeperUserId != sid)) 
                    return Results.NotFound(new { error = "Product not found or unauthorized access" });
            }
            
            return Results.Ok(new ProductResponse(
                product.Id, product.Name, product.Description, product.Price, product.StockQuantity, product.AgencyId, product.ShopkeeperUserId,
                product.AgencyId.HasValue ? "Agency" : (product.ShopkeeperUserId.HasValue ? "Shopkeeper" : "System"),
                product.AgencyId.HasValue ? product.Agency?.Name ?? "Unknown" : (product.ShopkeeperUserId.HasValue ? product.ShopkeeperUser?.Username ?? "Unknown" : "System")
            ));
        });

        // POST create product
        group.MapPost("/", async (
            [FromBody] CreateProductRequest request,
            AppDbContext context,
            IValidator<CreateProductRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            var isShopkeeper = userClaims.IsInRole(RoleConstants.Shopkeeper);
            var isAgency = userClaims.IsInRole(RoleConstants.Agency);
            
            Guid? finalAgencyId = null;
            Guid? finalShopkeeperUserId = null;

            if (isAdmin)
            {
                if (request.AgencyId.HasValue && request.ShopkeeperUserId.HasValue)
                {
                    return Results.BadRequest(new { error = "A product cannot belong to both an Agency and a Shopkeeper." });
                }
                finalAgencyId = request.AgencyId;
                finalShopkeeperUserId = request.ShopkeeperUserId;
            }
            else if (isAgency)
            {
                var agencyIdFromClaim = userClaims.FindFirstValue("agency_id");
                if (Guid.TryParse(agencyIdFromClaim, out Guid aid))
                    finalAgencyId = aid;
                else
                    return Results.BadRequest(new { error = "Your secondary Agency profile is missing. Please contact an administrator." });
            }
            else if (isShopkeeper)
            {
                var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(userIdString, out Guid sid))
                {
                    if (request.AgencyId.HasValue)
                    {
                        finalAgencyId = request.AgencyId.Value;
                        finalShopkeeperUserId = null;
                    }
                    else
                    {
                        finalShopkeeperUserId = sid;
                    }
                }
                else
                    return Results.BadRequest(new { error = "Your Shopkeeper user ID could not be identified." });
            }

            bool duplicateExists = await context.Products.AnyAsync(p => 
                p.Name.ToLower() == request.Name.ToLower() && 
                p.AgencyId == finalAgencyId && 
                p.ShopkeeperUserId == finalShopkeeperUserId);

            if (duplicateExists)
            {
                return Results.Conflict(new { error = "A product with this name already exists in this specific inventory (Agency or Shopkeeper)." });
            }

            var product = new Product
            {
                Name = request.Name,
                Description = request.Description,
                Price = request.Price,
                StockQuantity = request.StockQuantity,
                AgencyId = finalAgencyId,
                ShopkeeperUserId = finalShopkeeperUserId
            };
            context.Products.Add(product);
            await context.SaveChangesAsync();

            var agencyName = product.AgencyId.HasValue ? await context.Agencies.Where(a => a.Id == product.AgencyId).Select(a => a.Name).FirstOrDefaultAsync() : null;
            var shopkeeperName = product.ShopkeeperUserId.HasValue ? await context.Users.Where(u => u.Id == product.ShopkeeperUserId).Select(u => u.Username).FirstOrDefaultAsync() : null;

            return Results.Created($"/api/v1/products/{product.Id}",
                new ProductResponse(product.Id, product.Name, product.Description, product.Price, product.StockQuantity, product.AgencyId, product.ShopkeeperUserId,
                    product.AgencyId.HasValue ? "Agency" : (product.ShopkeeperUserId.HasValue ? "Shopkeeper" : "System"),
                    product.AgencyId.HasValue ? agencyName ?? "Unknown" : (product.ShopkeeperUserId.HasValue ? shopkeeperName ?? "Unknown" : "System")));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));

        // PUT update product
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateProductRequest request,
            AppDbContext context,
            IValidator<UpdateProductRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var product = await context.Products.FindAsync(id);
            if (product is null) return Results.NotFound(new { error = "Product not found" });

            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            
            if (!isAdmin)
            {
                if (userRole == RoleConstants.Agency)
                {
                    var aid = userClaims.FindFirstValue("agency_id");
                    if (product.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Product not found" });
                }
                else if (userRole == RoleConstants.Shopkeeper)
                {
                    var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    // Shopkeepers can ONLY update their own products
                    if (!Guid.TryParse(sidString, out Guid sid) || product.ShopkeeperUserId != sid) 
                        return Results.NotFound(new { error = "Product not found or unauthorized access" });
                }
            }

            if (isAdmin)
            {
                if (request.AgencyId.HasValue && request.ShopkeeperUserId.HasValue)
                {
                    return Results.BadRequest(new { error = "A product cannot belong to both an Agency and a Shopkeeper." });
                }
                
                // Only update the owner if an ID was explicitly passed in the request body.
                // This prevents accidental unassignment during simple name/price updates.
                if (request.AgencyId.HasValue)
                {
                    product.AgencyId = request.AgencyId.Value;
                    product.ShopkeeperUserId = null; // Ensure exclusive ownership
                }
                else if (request.ShopkeeperUserId.HasValue)
                {
                    product.ShopkeeperUserId = request.ShopkeeperUserId.Value;
                    product.AgencyId = null; // Ensure exclusive ownership
                }
            }

            var finalAgencyId = product.AgencyId;
            var finalShopkeeperUserId = product.ShopkeeperUserId;

            bool duplicateExists = await context.Products.AnyAsync(p => 
                p.Name.ToLower() == request.Name.ToLower() && 
                p.AgencyId == finalAgencyId && 
                p.ShopkeeperUserId == finalShopkeeperUserId &&
                p.Id != id);

            if (duplicateExists)
            {
                return Results.Conflict(new { error = "A product with this name already exists in this target inventory." });
            }

            product.Name = request.Name;
            product.Description = request.Description;
            product.Price = request.Price;
            product.StockQuantity = request.StockQuantity;

            await context.SaveChangesAsync();

            var agencyName = product.AgencyId.HasValue ? await context.Agencies.Where(a => a.Id == product.AgencyId).Select(a => a.Name).FirstOrDefaultAsync() : null;
            var shopkeeperName = product.ShopkeeperUserId.HasValue ? await context.Users.Where(u => u.Id == product.ShopkeeperUserId).Select(u => u.Username).FirstOrDefaultAsync() : null;

            return Results.Ok(new ProductResponse(product.Id, product.Name, product.Description, product.Price, product.StockQuantity, product.AgencyId, product.ShopkeeperUserId,
                    product.AgencyId.HasValue ? "Agency" : (product.ShopkeeperUserId.HasValue ? "Shopkeeper" : "System"),
                    product.AgencyId.HasValue ? agencyName ?? "Unknown" : (product.ShopkeeperUserId.HasValue ? shopkeeperName ?? "Unknown" : "System")));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));

        // DELETE product
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var product = await context.Products.FindAsync(id);
            if (product is null) return Results.NotFound(new { error = "Product not found" });

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Agency)
            {
                var aid = userClaims.FindFirstValue("agency_id");
                if (product.AgencyId?.ToString() != aid) return Results.NotFound(new { error = "Product not found" });
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!Guid.TryParse(sidString, out Guid sid) || product.ShopkeeperUserId != sid)
                {
                    return Results.NotFound(new { error = "Product not found or you do not have permission to delete it" });
                }
            }

            context.Products.Remove(product);
            await context.SaveChangesAsync();

            return Results.Ok(new { message = "Product deleted successfully" });
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper, RoleConstants.Agency));
    }
}
