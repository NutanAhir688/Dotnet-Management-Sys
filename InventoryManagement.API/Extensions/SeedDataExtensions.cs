using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using InventoryManagement.API.Services;
using Microsoft.EntityFrameworkCore;

namespace InventoryManagement.API.Extensions;

public static class SeedDataExtensions
{
    public static async Task SeedAdminUserAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        // Ensure Migrations are applied
        await context.Database.MigrateAsync();

        var adminExists = await context.Users.AnyAsync(u => u.Role == RoleConstants.Admin);
        if (!adminExists)
        {
            var adminUser = new User
            {
                Username = "admin",
                Email = "admin@example.com",
                PasswordHash = passwordHasher.HashPassword("Admin@123"),
                Role = RoleConstants.Admin
            };
            context.Users.Add(adminUser);
            await context.SaveChangesAsync();
        }

        var agencyExists = await context.Users.AnyAsync(u => u.Role == RoleConstants.Agency);
        if (!agencyExists)
        {
            var defaultAgency = new Agency
            {
                Name = "Default Agency",
                Address = "123 Wholesale St",
                Phone = "555-0101",
                TaxId = "TAX-999-001"
            };
            context.Agencies.Add(defaultAgency);
            await context.SaveChangesAsync();

            var agencyUser = new User
            {
                Username = "agency",
                Email = "agency@example.com",
                PasswordHash = passwordHasher.HashPassword("Agency@123"),
                Role = RoleConstants.Agency,
                AgencyId = defaultAgency.Id
            };
            context.Users.Add(agencyUser);
            await context.SaveChangesAsync();
        }
    }
}