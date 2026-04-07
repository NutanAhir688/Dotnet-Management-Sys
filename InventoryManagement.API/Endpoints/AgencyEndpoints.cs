                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;

namespace InventoryManagement.API.Endpoints;

public static class AgencyEndpoints
{
    public static void MapAgencyEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/agencies")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Agencies")
                       .RequireAuthorization()
                       .HasApiVersion(1.0)
                       .RequireRateLimiting("fixed");

        group.MapGet("/", async (AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var query = context.Agencies.AsQueryable();
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userRole == RoleConstants.Agency && Guid.TryParse(userIdString, out Guid userId))
            {
                // Check both the claim and the database to avoid re-login issues
                var userFromDb = await context.Users.FindAsync(userId);
                var aidString = userClaims.FindFirstValue("agency_id") ?? userFromDb?.AgencyId?.ToString();

                if (Guid.TryParse(aidString, out Guid aid))
                {
                    // An Agency user should ALWAYS be able to see their own agency record
                    query = query.Where(a => a.Id == aid);
                }
                else
                {
                    // If they have no agency yet, return empty list
                    query = query.Where(a => false);
                }
            }
            else if (userRole == RoleConstants.Shopkeeper && Guid.TryParse(userIdString, out Guid sidGuid))
            {
                // Shopkeepers only see agencies they are 'Attached' to or their own created agencies
                var linkedAgencyIds = await context.ShopkeeperSuppliers
                    .Where(s => s.ShopkeeperUserId == sidGuid)
                    .Select(s => s.AgencyId)
                    .ToListAsync();

                query = query.Where(a => 
                    a.CreatedByUserId == sidGuid || 
                    a.CreatedByUserId == null || 
                    linkedAgencyIds.Contains(a.Id)
                );
            }
            
            var agencies = await query.ToListAsync();
            return Results.Ok(agencies.Select(a => new AgencyResponse(a.Id, a.Name, a.Address, a.Phone, a.TaxId, a.CreatedAt)));
        }).CacheOutput(p => p.Expire(TimeSpan.FromSeconds(30)));

        // NEW: Discover Suppliers (for Shopkeepers to see ALL available wholesale agencies)
        group.MapGet("/discover", async (AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userRole != RoleConstants.Shopkeeper || !Guid.TryParse(userIdString, out Guid sid)) return Results.Unauthorized();

            // Get agencies that belong to real Wholesale agents AND that this shopkeeper hasn't attached to yet
            var alreadyLinkedIds = await context.ShopkeeperSuppliers
                .Where(s => s.ShopkeeperUserId == sid)
                .Select(s => s.AgencyId)
                .ToListAsync();

            var wholesaleUserIds = await context.Users
                .Where(u => u.Role == RoleConstants.Agency)
                .Select(u => u.Id)
                .ToListAsync();

            var list = await context.Agencies.Where(a => 
                (a.CreatedByUserId.HasValue && wholesaleUserIds.Contains(a.CreatedByUserId.Value)) &&
                !alreadyLinkedIds.Contains(a.Id)
            ).ToListAsync();
            
            return Results.Ok(list.Select(a => new AgencyResponse(a.Id, a.Name, a.Address, a.Phone, a.TaxId, a.CreatedAt)));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Shopkeeper));

        // NEW: Attach to an Agency
        group.MapPost("/attach/{agencyId:guid}", async (Guid agencyId, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid sid)) return Results.Unauthorized();

            var existing = await context.ShopkeeperSuppliers.AnyAsync(s => s.ShopkeeperUserId == sid && s.AgencyId == agencyId);
            if (existing) return Results.Ok(new { message = "Already attached to this agency." });

            var link = new ShopkeeperSupplier { ShopkeeperUserId = sid, AgencyId = agencyId };
            context.ShopkeeperSuppliers.Add(link);
            await context.SaveChangesAsync();

            return Results.Ok(new { message = "Successfully attached to agency." });
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Shopkeeper));

        // NEW: Detach from an Agency
        group.MapDelete("/detach/{agencyId:guid}", async (Guid agencyId, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid sid)) return Results.Unauthorized();

            var link = await context.ShopkeeperSuppliers.FirstOrDefaultAsync(s => s.ShopkeeperUserId == sid && s.AgencyId == agencyId);
            if (link != null)
            {
                context.ShopkeeperSuppliers.Remove(link);
                await context.SaveChangesAsync();
            }

            return Results.Ok(new { message = "Successfully detached from agency." });
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Shopkeeper));

        group.MapGet("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var agency = await context.Agencies.FindAsync(id);
            if (agency is null) return Results.NotFound();

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userRole == RoleConstants.Agency)
            {
                var userAgencyId = userClaims.FindFirstValue("agency_id");
                if (agency.Id.ToString() != userAgencyId) return Results.NotFound();
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                if (!Guid.TryParse(userIdString, out Guid sid) || (agency.CreatedByUserId != sid && agency.CreatedByUserId != null))
                {
                    return Results.NotFound();
                }
            }

            return Results.Ok(new AgencyResponse(agency.Id, agency.Name, agency.Address, agency.Phone, agency.TaxId, agency.CreatedAt));
        });

        group.MapPost("/", async (
            [FromBody] AgencyRequest request,
            AppDbContext context,
            IValidator<AgencyRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userRole == RoleConstants.Agency && Guid.TryParse(userIdString, out Guid aid))
            {
                var user = await context.Users.FindAsync(aid);
                if (user?.AgencyId != null)
                {
                    // Verify if the agency actually exists in the database
                    var agencyExists = await context.Agencies.AnyAsync(a => a.Id == user.AgencyId);
                    if (agencyExists)
                    {
                        return Results.BadRequest(new { error = "Your account is already linked to an existing agency (" + user.AgencyId + "). You cannot create another one." });
                    }
                    else
                    {
                        // The linked agency is gone (deleted). Clear the dead ID so they can create a new one.
                        user.AgencyId = null;
                        await context.SaveChangesAsync();
                    }
                }
            }

            var agency = new Agency
            {
                Name = request.Name,
                Address = request.Address,
                Phone = request.Phone,
                TaxId = request.TaxId,
                CreatedByUserId = Guid.TryParse(userIdString, out Guid uid) ? uid : null
            };

            context.Agencies.Add(agency);
            await context.SaveChangesAsync();

            // Auto-link newly created agency to the Agency user making the request
            if (userRole == RoleConstants.Agency && Guid.TryParse(userIdString, out Guid userId))
            {
                var user = await context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.AgencyId = agency.Id;
                    await context.SaveChangesAsync();
                }
            }

            return Results.Created($"/api/v1/agencies/{agency.Id}", new AgencyResponse(agency.Id, agency.Name, agency.Address, agency.Phone, agency.TaxId, agency.CreatedAt));
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Agency, RoleConstants.Shopkeeper));
        
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] AgencyRequest request,
            AppDbContext context,
            IValidator<AgencyRequest> validator,
            ClaimsPrincipal userClaims) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            var agency = await context.Agencies.FindAsync(id);
            if (agency is null) return Results.NotFound();

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userRole == RoleConstants.Agency)
            {
                var userAgencyId = userClaims.FindFirstValue("agency_id");
                if (agency.Id.ToString() != userAgencyId) return Results.NotFound(new { error = "Unauthorized access to this agency" });
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                if (!Guid.TryParse(userIdString, out Guid sid) || agency.CreatedByUserId != sid)
                {
                    return Results.NotFound(new { error = "Agency not found or you do not have permission to update it" });
                }
            }

            agency.Name = request.Name;
            agency.Address = request.Address;
            agency.Phone = request.Phone;
            agency.TaxId = request.TaxId;

            await context.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Agency, RoleConstants.Shopkeeper));

        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var agency = await context.Agencies.FindAsync(id);
            if (agency is null) return Results.NotFound(new { error = "Agency not found" });

            var userRole = userClaims.FindFirstValue(ClaimTypes.Role);
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userRole == RoleConstants.Agency)
            {
                var userAgencyId = userClaims.FindFirstValue("agency_id");
                if (agency.Id.ToString() != userAgencyId) return Results.NotFound(new { error = "Unauthorized access to this agency" });
            }
            else if (userRole == RoleConstants.Shopkeeper)
            {
                if (!Guid.TryParse(userIdString, out Guid sid) || agency.CreatedByUserId != sid) 
                {
                    return Results.NotFound(new { error = "Agency not found or you do not have permission to delete it" });
                }
            }

            // Manually handle dependent products first (since we can't rely on Cascade Delete with Restrict behavior)
            var products = await context.Products.Where(p => p.AgencyId == id).ToListAsync();
            if (products.Any())
            {
                context.Products.RemoveRange(products);
            }

            context.Agencies.Remove(agency);
            
            // If the user who is deleting the agency is an 'Agency' role user,
            // we should also clear their link so they can create a new one if they want.
            if (userRole == RoleConstants.Agency && Guid.TryParse(userIdString, out Guid userId))
            {
                var userProfile = await context.Users.FindAsync(userId);
                if (userProfile != null)
                {
                    userProfile.AgencyId = null;
                }
            }

            await context.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin, RoleConstants.Agency, RoleConstants.Shopkeeper));
    }
}
