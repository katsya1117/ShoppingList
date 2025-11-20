using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ShoppingListApp.Api;
using ShoppingListApp.Data;
using ShoppingListApp.Models;
using System.IO;

var builder = WebApplication.CreateBuilder(args);
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "app.db");
builder.Services.AddDbContext<AppDbContext>(o =>
{
    o.UseSqlite($"Data Source={dbPath}");
    o.EnableDetailedErrors();
    o.EnableSensitiveDataLogging();
});

builder.Services.Configure<ApiOptions>(builder.Configuration.GetSection(ApiOptions.SectionName));
builder.Services.AddScoped<ApiKeyEndpointFilter>();

// Add services to the container.
builder.Services.AddRazorPages();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapRazorPages();

var api = app.MapGroup("/api")
    .AddEndpointFilter<ApiKeyEndpointFilter>();

// Ensure database exists and is up-to-date
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    if (!db.Categories.Any())
    {
        db.Categories.AddRange(
            new Category { Name = "食料品" },
            new Category { Name = "調味料" },
            new Category { Name = "生活用品" }
        );
        db.SaveChanges();
    }
}

// Toggle availability for an item
api.MapPatch("availability/{itemId:int}", async (
    int itemId,
    [FromBody] ToggleRequest req,
    AppDbContext db) =>
{
    if (!await db.Items.AnyAsync(i => i.Id == itemId))
        return Results.NotFound($"Item {itemId} not found");

    if (string.IsNullOrWhiteSpace(req.UpdatedBy))
        req = req with { UpdatedBy = "anon" };

    try
    {
        var a = await db.ItemAvailabilities.FindAsync(itemId)
            ?? db.ItemAvailabilities.Add(new ItemAvailability { ItemId = itemId }).Entity;

        a.IsAvailable = req.IsAvailable;
        a.UpdatedAt = DateTime.UtcNow;
        a.UpdatedBy = req.UpdatedBy;

        await db.SaveChangesAsync();
        return Results.Ok(new { itemId, a.IsAvailable, a.UpdatedAt, a.UpdatedBy });
    }
    catch (DbUpdateException ex)
    {
        return Results.Problem(ex.InnerException?.Message ?? ex.Message);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

// Suggest existing items by prefix (case-insensitive)
api.MapGet("items", async (
    [FromQuery] string? prefix,
    [FromQuery] int? limit,
    AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(prefix)) return Results.BadRequest();

    var max = Math.Clamp(limit ?? 10, 1, 50);
    var q = prefix.Trim().ToLower();

    var items = await db.Items
        .Include(i => i.Category)
        .Where(i => i.Name.ToLower().StartsWith(q))
        .OrderBy(i => i.Name)
        .Take(max)
        .Select(i => new { i.Id, i.Name, Category = i.Category.Name })
        .ToListAsync();

    return Results.Ok(new { exists = items.Count > 0, items });
});

// Add a new master item
api.MapPost("items", async (
    [FromBody] CreateItemRequest req,
    AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Name) || req.CategoryId <= 0)
        return Results.BadRequest("Name and CategoryId are required");

    var name = req.Name.Trim();
    var exists = await db.Items.AnyAsync(i => i.Name.ToLower() == name.ToLower());
    if (exists) return Results.Conflict("Item already exists");

    var item = new Item { Name = name, CategoryId = req.CategoryId };
    db.Items.Add(item);
    await db.SaveChangesAsync();

    // Initialize availability as false by default
    db.ItemAvailabilities.Add(new ItemAvailability
    {
        ItemId = item.Id,
        IsAvailable = false,
        UpdatedAt = DateTime.UtcNow,
        UpdatedBy = "system"
    });
    await db.SaveChangesAsync();

    var created = await db.Items.Include(i => i.Category)
        .Where(i => i.Id == item.Id)
        .Select(i => new { i.Id, i.Name, Category = i.Category.Name })
        .FirstAsync();

    return Results.Created($"/api/items/{item.Id}", created);
});

app.Run();
