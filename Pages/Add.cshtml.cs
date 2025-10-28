using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Data;
using ShoppingListApp.Models;

namespace ShoppingListApp.Pages;

public class AddModel : PageModel
{
    private readonly AppDbContext _db;
    public List<Category> Categories { get; set; } = new();

    public AddModel(AppDbContext db)
    {
        _db = db;
    }

    public async Task OnGetAsync()
    {
        Categories = await _db.Categories
            .OrderBy(c => c.Name)
            .ToListAsync();
    }
}

