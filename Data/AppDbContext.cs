using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Models;

namespace ShoppingListApp.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> o) : base(o) { }
    public DbSet<Item> Items => Set<Item>();
    public DbSet<ItemAvailability> ItemAvailabilities => Set<ItemAvailability>();
    public DbSet<Category> Categories => Set<Category>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<ItemAvailability>()
         .HasKey(a => a.ItemId);

        b.Entity<ItemAvailability>()
         .HasOne(a => a.Item)
         .WithOne()
         .HasForeignKey<ItemAvailability>(a => a.ItemId)   // ← これが重要
         .OnDelete(DeleteBehavior.Cascade);
    }
}
