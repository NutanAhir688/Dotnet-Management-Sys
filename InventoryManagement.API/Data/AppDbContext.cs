using InventoryManagement.API.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryManagement.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Bill> Bills => Set<Bill>();
    public DbSet<Agency> Agencies => Set<Agency>();
    public DbSet<ShopkeeperSupplier> ShopkeeperSuppliers => Set<ShopkeeperSupplier>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User - Agency relationship
        modelBuilder.Entity<User>()
            .HasOne(u => u.Agency)
            .WithMany()
            .HasForeignKey(u => u.AgencyId)
            .OnDelete(DeleteBehavior.Restrict);

        // Agency - CreatedByUser relationship
        modelBuilder.Entity<Agency>()
            .HasOne(a => a.CreatedByUser)
            .WithMany()
            .HasForeignKey(a => a.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Global Query Filters for Soft Delete
        // (Note: To avoid navigation property filter warnings, we apply them explicitly for each base entity)
        modelBuilder.Entity<User>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Customer>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Order>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<OrderItem>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Bill>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Agency>().HasQueryFilter(e => !e.IsDeleted);
        
        // Add filtering for the new ShopkeeperSupplier connection table
        modelBuilder.Entity<ShopkeeperSupplier>().HasQueryFilter(e => !e.IsDeleted);

        // Explicit Relationships
        modelBuilder.Entity<Product>()
            .HasOne(p => p.Agency)
            .WithMany()
            .HasForeignKey(p => p.AgencyId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Product>()
            .HasOne(p => p.ShopkeeperUser)
            .WithMany()
            .HasForeignKey(p => p.ShopkeeperUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Customer -> ShopkeeperUser
        modelBuilder.Entity<Customer>()
            .HasOne(c => c.ShopkeeperUser)
            .WithMany()
            .HasForeignKey(c => c.ShopkeeperUserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
            .HasOne(o => o.Customer)
            .WithMany()
            .HasForeignKey(o => o.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
            .HasOne(o => o.Agency)
            .WithMany(a => a.Orders)
            .HasForeignKey(o => o.AgencyId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
            .HasOne(o => o.ShopkeeperUser)
            .WithMany()
            .HasForeignKey(o => o.ShopkeeperUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Decimal precision for money fields
        modelBuilder.Entity<Product>()
            .Property(p => p.Price)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Order>()
            .Property(o => o.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Order>()
            .Property(o => o.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<OrderItem>()
            .Property(oi => oi.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<OrderItem>()
            .Property(oi => oi.TotalPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Bill>()
            .Property(b => b.Amount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Bill>()
            .Property(b => b.PaidAmount)
            .HasPrecision(18, 2);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<ISoftDeletable>())
        {
            switch (entry.State)
            {
                case EntityState.Deleted:
                    entry.State = EntityState.Modified;
                    entry.Entity.IsDeleted = true;
                    entry.Entity.DeletedAt = DateTime.UtcNow;
                    break;
            }
        }
        
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = DateTime.UtcNow;
                    break;
                case EntityState.Modified:
                    entry.Entity.UpdatedAt = DateTime.UtcNow;
                    break;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}
