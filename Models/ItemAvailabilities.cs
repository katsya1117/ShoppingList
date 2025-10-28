using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Data;

namespace ShoppingListApp.Models;

public class ItemAvailability
{
    [Key, ForeignKey("Item")]               // ← FKが ItemId だと明示
    public int ItemId
    {
        get; set;
    }
    public bool IsAvailable
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
    public string UpdatedBy { get; set; } = "";
    public Item? Item
    {
        get; set;
    }
}
