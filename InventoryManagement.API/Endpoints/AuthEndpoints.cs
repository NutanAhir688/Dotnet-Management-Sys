using FluentValidation;
using InventoryManagement.API.DTOs;
using InventoryManagement.API.Services;
using InventoryManagement.API.Models;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace InventoryManagement.API.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app, Asp.Versioning.Builder.ApiVersionSet apiVersionSet)
    {
        var group = app.MapGroup("/api/v{version:apiVersion}/auth")
                       .WithApiVersionSet(apiVersionSet)
                       .WithTags("Auth")
                       .HasApiVersion(1.0);

        group.MapPost("/login", async ([FromBody] LoginRequest request, IAuthService authService, IValidator<LoginRequest> validator) =>
        {
            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            try
            {
                var token = await authService.LoginAsync(request.Email, request.Password);
                return Results.Ok(new AuthResponse(token));
            }
            catch (Exception ex)
            {
                Serilog.Log.Error(ex, "Login error for {Email}", request.Email);
                if (ex.Message.Contains("Invalid email or password"))
                {
                    return Results.Unauthorized();
                }
                return Results.Problem("An error occurred during login. Please ensure the database is accessible.", statusCode: 500);
            }
        });

        group.MapPost("/register", async ([FromBody] RegisterRequest request, IAuthService authService, IValidator<RegisterRequest> validator, ClaimsPrincipal userClaims) =>
        {
            // Only Admin can register new users
            if (!userClaims.IsInRole(RoleConstants.Admin))
            {
                return Results.Forbid();
            }

            var validationResult = await validator.ValidateAsync(request);
            if (!validationResult.IsValid) return Results.ValidationProblem(validationResult.ToDictionary());

            try
            {
                await authService.RegisterAsync(request.Username, request.Email, request.Password, request.Role, request.AgencyId);
                return Results.Ok(new { message = "User registered successfully" });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        }).RequireAuthorization(policy => policy.RequireRole(RoleConstants.Admin));
    }
}
