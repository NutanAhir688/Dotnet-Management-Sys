using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace InventoryManagement.API.Endpoints;

public static class CustomerEndpoints
{
    public static void MapCustomerEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/customers")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Customers")
                       .RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper))
                       .HasApiVersion(1.0)
                       .RequireRateLimiting("fixed");

        // GET all customers
        group.MapGet("/", async (
            AppDbContext context,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null,
            ClaimsPrincipal userClaims = null!) =>
        {
            var query = context.Customers.Include(c => c.ShopkeeperUser).AsQueryable();

            if (userClaims != null)
            {
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(sidString, out Guid sidGuid))
                {
                    query = query.Where(c => c.ShopkeeperUserId == sidGuid);
                }
            }
            else if (userRole == RoleConstants.Agency)
            {
                // Agencies can't see retail customers in this system
                query = query.Where(c => false);
            }
            // Admin sees all by default, no filtering needed here.
            }

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(c => c.Name.Contains(search) || c.Email.Contains(search));

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var customers = await query.OrderBy(c => c.Name).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
            var data = customers.Select(c => new CustomerResponse(c.Id, c.Name, c.Email, c.Phone, c.ShopkeeperUserId, c.ShopkeeperUser?.Username)).ToList();

            return Results.Ok(new PaginatedResponse<CustomerResponse>(data, page, pageSize, totalCount, totalPages));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(30)));

        // GET single customer
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var customer = await context.Customers.Include(c => c.ShopkeeperUser).FirstOrDefaultAsync(c => c.Id == id);
            if (customer is null) return Results.NotFound(new { error = "Customer not found" });

            if (userClaims != null)
            {
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            if (userRole == RoleConstants.Shopkeeper)
            {
                var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                if (customer.ShopkeeperUserId?.ToString() != sidString) return Results.NotFound(new { error = "Customer not found" });
            }
            else if (userRole == RoleConstants.Agency)
            {
                return Results.NotFound(new { error = "Customer not found" });
            }
            }
            return Results.Ok(new CustomerResponse(customer.Id, customer.Name, customer.Email, customer.Phone, customer.ShopkeeperUserId, customer.ShopkeeperUser?.Username));
        });

        // POST create customer
        group.MapPost("/", async (
            [FromBody] CreateCustomerRequest request,
            AppDbContext context,
            IValidator<CreateCustomerRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

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

            var customer = new Customer
            {
                Name = request.Name,
                Email = request.Email,
                Phone = request.Phone,
                ShopkeeperUserId = sidGuid
            };

            context.Customers.Add(customer);
            await context.SaveChangesAsync();

            return Results.Created($"/api/v1/customers/{customer.Id}", new CustomerResponse(customer.Id, customer.Name, customer.Email, customer.Phone, sidGuid, userClaims.Identity?.Name));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper));

        // PUT update customer
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateCustomerRequest request,
            AppDbContext context,
            IValidator<UpdateCustomerRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var customer = await context.Customers.FindAsync(id);
            if (customer is null) return Results.NotFound(new { error = "Customer not found" });

            var isAdmin = userClaims.IsInRole(RoleConstants.Admin);
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            
            if (!isAdmin)
            {
                if (userRole == RoleConstants.Shopkeeper)
                {
                    var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (customer.ShopkeeperUserId?.ToString() != sidString) return Results.NotFound(new { error = "Customer not found" });
                }
                else if (userRole == RoleConstants.Agency)
                {
                    return Results.NotFound(new { error = "Customer not found" });
                }
            }

            if (isAdmin)
            {
                customer.ShopkeeperUserId = request.ShopkeeperUserId;
            }

            customer.Name = request.Name;
            customer.Email = request.Email;
            customer.Phone = request.Phone;

            await context.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper));

        // DELETE customer
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var customer = await context.Customers.FindAsync(id);
            if (customer is null) return Results.NotFound(new { error = "Customer not found" });

            if (userClaims != null)
            {
                var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
                if (userRole == RoleConstants.Shopkeeper)
                {
                    var sidString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (customer.ShopkeeperUserId?.ToString() != sidString) return Results.NotFound(new { error = "Customer not found" });
                }
            }

            context.Customers.Remove(customer);
            await context.SaveChangesAsync();
            return Results.Ok(new { message = "Customer deleted successfully" });
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Shopkeeper));
    }
}
