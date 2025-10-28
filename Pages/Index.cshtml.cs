using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Data;
using ShoppingListApp.Models;

namespace ShoppingListApp.Pages;
public class IndexModel : PageModel
{
    private readonly ILogger<IndexModel> _logger;
    private readonly AppDbContext _db;
    public List<ItemView> Items { get; set; } = new();
    public List<ItemView> MasterItems { get; set; } = new();
    public List<ItemView> BuyList { get; set; } = new();
    public List<Category> Categories { get; set; } = new();

    [BindProperty] public Item NewItem { get; set; } = new();

    public IndexModel(ILogger<IndexModel> logger, AppDbContext db)
    {
        _logger = logger;
        _db = db;
    }

    public class ItemView
    {
        public int Id
        {
            get; set;
        }
        public string Name { get; set; } = "";
        public string Category { get; set; } = "";
        public bool IsAvailable
        {
            get; set;
        }
        public DateTime? LastUpdated
        {
            get; set;
        }
    }

    public async Task OnGetAsync()
    {
        Categories = await _db.Categories
            .OrderBy(c => c.Name)
            .ToListAsync();

        var items = await _db.Items
            .Include(i => i.Category)
            .OrderBy(i => i.Category.Name)
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
                Category = i.Category?.Name ?? "",
                IsAvailable = record?.IsAvailable ?? false,
                LastUpdated = record?.UpdatedAt
            };
        }).ToList();

        BuyList = MasterItems.Where(x => !x.IsAvailable).ToList();

        Items = MasterItems;
    }

    public async Task<IActionResult> OnPostAsync()
    {
        if (string.IsNullOrWhiteSpace(NewItem.Name) ||
            NewItem.CategoryId == 0)
            return Page();

        _db.Items.Add(NewItem);
        await _db.SaveChangesAsync();
        return RedirectToPage();
    }

    //public void OnGet()
    //{

    //}
}
