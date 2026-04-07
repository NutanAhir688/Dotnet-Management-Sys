using InventoryManagement.API.DTOs;
using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using InventoryManagement.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using FluentValidation;

namespace InventoryManagement.API.Endpoints;

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/profile")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Profile")
                       .RequireAuthorization();

        // GET own profile
        group.MapGet("/", async (AppDbContext context, ClaimsPrincipal userClaims) =>
        {
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Results.Unauthorized();

            var user = await context.Users.FindAsync(userId);
            if (user is null) return Results.NotFound();

            return Results.Ok(new {
                user.Id,
                user.Username,
                user.Email,
                user.Role,
                user.AgencyId
            });
        });

        // PUT update own profile (credentials)
        group.MapPut("/", async (
            [FromBody] UpdateProfileRequest request,
            AppDbContext context,
            IPasswordHasher passwordHasher,
            ClaimsPrincipal userClaims) =>
        {
            var userIdString = userClaims.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? userClaims.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Results.Unauthorized();

            var user = await context.Users.FindAsync(userId);
            if (user is null) return Results.NotFound();

            if (!string.IsNullOrWhiteSpace(request.Username))
                user.Username = request.Username;

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                // Check if email is already taken by another user
                var emailTaken = await context.Users.AnyAsync(u => u.Email == request.Email && u.Id != userId);
                if (emailTaken) return Results.BadRequest(new { error = "Email is already in use." });
                user.Email = request.Email;
            }

            if (!string.IsNullOrWhiteSpace(request.Password))
                user.PasswordHash = passwordHasher.HashPassword(request.Password);

            await context.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

public record UpdateProfileRequest(string? Username, string? Email, string? Password);
