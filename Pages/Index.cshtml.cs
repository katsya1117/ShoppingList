using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Data;
using ShoppingListApp.Models;

namespace ShoppingListApp.Pages;

public class IndexModel : PageModel
{
    private readonly AppDbContext _db;

    public List<ItemView> MasterItems { get; private set; } = new();
    public List<ItemView> BuyList { get; private set; } = new();
    public List<Category> Categories { get; private set; } = new();

    [BindProperty]
    public MasterItemInput MasterForm { get; set; } = new();

    public IndexModel(AppDbContext db)
    {
        _db = db;
    }

    public class ItemView
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public bool IsAvailable { get; set; }
        public DateTime? LastUpdated { get; set; }
    }

    public class MasterItemInput
    {
        [Required]
        [StringLength(128)]
        public string Name { get; set; } = string.Empty;

        [Display(Name = "Category")]
        [Range(1, int.MaxValue, ErrorMessage = "Please select a category.")]
        public int CategoryId { get; set; }
    }

    public class ToggleAvailabilityRequest
    {
        public int ItemId { get; set; }
        public bool IsAvailable { get; set; }
        public string? UpdatedBy { get; set; }
    }

    // ページ初期表示で必要なデータを読み込んでビューへ渡す
    public async Task OnGetAsync()
    {
        await LoadPageAsync();
    }

    // 新しいマスタ項目をサーバー側で追加する
    public async Task<IActionResult> OnPostCreateMasterAsync([FromForm] MasterItemInput masterForm)
    {
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToArray();
            return BadRequest(new { errors });
        }

        var trimmedName = masterForm.Name.Trim();
        var normalizedName = trimmedName.ToLower();
        var exists = await _db.Items
            .AnyAsync(i =>
                i.CategoryId == masterForm.CategoryId &&
                i.Name.ToLower() == normalizedName);
        if (exists)
        {
            return StatusCode(StatusCodes.Status409Conflict, new { message = "Item already exists in master list." });
        }

        var category = await _db.Categories
            .FirstOrDefaultAsync(c => c.Id == masterForm.CategoryId);
        if (category is null)
        {
            return BadRequest(new { message = "Selected category does not exist." });
        }

        var item = new Item
        {
            Name = trimmedName,
            CategoryId = masterForm.CategoryId
        };

        _db.Items.Add(item);
        await _db.SaveChangesAsync();

        var availability = new ItemAvailability
        {
            ItemId = item.Id,
            IsAvailable = false,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = User?.Identity?.Name ?? "system"
        };
        _db.ItemAvailabilities.Add(availability);
        await _db.SaveChangesAsync();

        return new JsonResult(new
        {
            id = item.Id,
            name = item.Name,
            category = category.Name,
            updatedAt = availability.UpdatedAt
        });
    }

    // マスタと買い物リストの在庫状態を切り替える
    public async Task<IActionResult> OnPostToggleAvailabilityAsync([FromBody] ToggleAvailabilityRequest request)
    {
        if (request is null || request.ItemId <= 0)
        {
            return BadRequest(new { message = "Invalid item request." });
        }

        if (!await _db.Items.AnyAsync(i => i.Id == request.ItemId))
        {
            return NotFound(new { message = $"Item {request.ItemId} not found." });
        }

        var availability = await _db.ItemAvailabilities.FindAsync(request.ItemId);
        if (availability is null)
        {
            availability = new ItemAvailability { ItemId = request.ItemId };
            _db.ItemAvailabilities.Add(availability);
        }

        availability.IsAvailable = request.IsAvailable;
        availability.UpdatedAt = DateTime.UtcNow;
        availability.UpdatedBy = string.IsNullOrWhiteSpace(request.UpdatedBy) ? "anon" : request.UpdatedBy;
        await _db.SaveChangesAsync();

        return new JsonResult(new
        {
            itemId = availability.ItemId,
            availability.IsAvailable,
            updatedAt = availability.UpdatedAt,
            availability.UpdatedBy
        });
    }

    // データベースからマスタ一覧と買い物リストを再構築する
    private async Task LoadPageAsync()
    {
        Categories = await _db.Categories
            .OrderBy(c => c.Name)
            .ToListAsync();

        var items = await _db.Items
            .Include(i => i.Category)
            .OrderBy(i => i.Category != null ? i.Category.Name : string.Empty)
            .ThenBy(i => i.Name)
            .ToListAsync();

        var availability = await _db.ItemAvailabilities
            .ToDictionaryAsync(a => a.ItemId);

        MasterItems = items.Select(i =>
        {
            availability.TryGetValue(i.Id, out var record);
            return new ItemView
            {
                Id = i.Id,
                Name = i.Name,
                Category = i.Category?.Name ?? string.Empty,
                IsAvailable = record?.IsAvailable ?? false,
                LastUpdated = record?.UpdatedAt
            };
        }).ToList();

        BuyList = MasterItems
            .Where(x => !x.IsAvailable)
            .ToList();
    }
}
