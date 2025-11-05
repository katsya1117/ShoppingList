using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Data;
using ShoppingListApp.Models;

namespace ShoppingListApp.Pages;

/// <summary>
/// 買い物リスト画面（/Index）のページモデル。画面表示に必要なデータの読み込みと、
/// マスタ追加／在庫トグルに対する Ajax ハンドラーを提供する。
/// </summary>
public class IndexModel : PageModel
{
    private readonly AppDbContext _db;

    /// <summary>マスタ一覧（カテゴリ別にソート済み）をビューへ渡すためのコレクション。</summary>
    public List<ItemView> MasterItems { get; private set; } = new();

    /// <summary>買い物リスト（在庫なしのマスタ項目）をビューへ渡すためのコレクション。</summary>
    public List<ItemView> BuyList { get; private set; } = new();

    /// <summary>マスタ追加フォームで選択肢として使うカテゴリ一覧。</summary>
    public List<Category> Categories { get; private set; } = new();

    /// <summary>マスタ追加モーダルから送信される入力値をバインドするためのプロパティ。</summary>
    [BindProperty]
    public MasterItemInput MasterForm { get; set; } = new();

    public IndexModel(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>ビューで扱いやすいように整形したマスタ／買い物リストの1アイテム情報。</summary>
    public class ItemView
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public bool IsAvailable { get; set; }
        public DateTime? LastUpdated { get; set; }
    }

    /// <summary>マスタ追加フォームの入力内容を保持するためのクラス。</summary>
    public class MasterItemInput
    {
        [Required]
        [StringLength(128)]
        public string Name { get; set; } = string.Empty;

        [Display(Name = "Category")]
        [Range(1, int.MaxValue, ErrorMessage = "Please select a category.")]
        public int CategoryId { get; set; }
    }

    /// <summary>在庫状態トグルの Ajax リクエストで受け取る JSON の形。</summary>
    public class ToggleAvailabilityRequest
    {
        public int ItemId { get; set; }
        public bool IsAvailable { get; set; }
        public string? UpdatedBy { get; set; }
    }

    /// <summary>
    /// GET /Index 実行時に呼ばれ、マスタ・買い物リスト・カテゴリを読み込んでビューに引き渡す。
    /// </summary>
    public async Task OnGetAsync()
    {
        await LoadPageAsync();
    }

    /// <summary>
    /// マスタ追加モーダルから送信された入力を検証し、新しいマスタ項目を登録して JSON で返す。
    /// </summary>
    public async Task<IActionResult> OnPostCreateMasterAsync([FromForm] MasterItemInput masterForm)
    {
        // Razor サイドの検証属性ではじかれなかったか再確認し、エラーを集めて返す
        if (!ModelState.IsValid)
        {
            var errors = ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage)
                .ToArray();
            return BadRequest(new { errors });
        }

        // 名前を正規化して、同一カテゴリ内に重複がないかをチェックする
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

        // 選択されたカテゴリが DB 上に存在するか確認する（削除済みなどのケースを防ぐ）
        var category = await _db.Categories
            .FirstOrDefaultAsync(c => c.Id == masterForm.CategoryId);
        if (category is null)
        {
            return BadRequest(new { message = "Selected category does not exist." });
        }

        // 入力内容を元に Item レコードを作成する
        var item = new Item
        {
            Name = trimmedName,
            CategoryId = masterForm.CategoryId
        };

        _db.Items.Add(item);
        await _db.SaveChangesAsync();

        // 新規作成直後は「在庫なし」状態として Availability を初期化する
        var availability = new ItemAvailability
        {
            ItemId = item.Id,
            IsAvailable = false,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = User?.Identity?.Name ?? "system"
        };
        _db.ItemAvailabilities.Add(availability);
        await _db.SaveChangesAsync();

        // フロント側でリストに追加しやすいよう JSON を返す
        return new JsonResult(new
        {
            id = item.Id,
            name = item.Name,
            category = category.Name,
            updatedAt = availability.UpdatedAt
        });
    }

    /// <summary>
    /// 在庫トグルの Ajax リクエストを受け取り、対象アイテムの在庫状態を更新して結果を返す。
    /// </summary>
    public async Task<IActionResult> OnPostToggleAvailabilityAsync([FromBody] ToggleAvailabilityRequest request)
    {
        // リクエストの整合性チェック（IDが0以下など）に引っかかったら 400
        if (request is null || request.ItemId <= 0)
        {
            return BadRequest(new { message = "Invalid item request." });
        }

        // 対象アイテムが存在しなければ 404
        if (!await _db.Items.AnyAsync(i => i.Id == request.ItemId))
        {
            return NotFound(new { message = $"Item {request.ItemId} not found." });
        }

        // 既存の Availability を取得、なければ新規作成して追記する
        var availability = await _db.ItemAvailabilities.FindAsync(request.ItemId);
        if (availability is null)
        {
            availability = new ItemAvailability { ItemId = request.ItemId };
            _db.ItemAvailabilities.Add(availability);
        }

        // 在庫状態と更新者・更新日時を設定して保存
        availability.IsAvailable = request.IsAvailable;
        availability.UpdatedAt = DateTime.UtcNow;
        availability.UpdatedBy = string.IsNullOrWhiteSpace(request.UpdatedBy) ? "anon" : request.UpdatedBy;
        await _db.SaveChangesAsync();

        // クライアントで画面更新ができるよう変更結果を返す
        return new JsonResult(new
        {
            itemId = availability.ItemId,
            availability.IsAvailable,
            updatedAt = availability.UpdatedAt,
            availability.UpdatedBy
        });
    }

    /// <summary>
    /// DB からカテゴリ・マスタ一覧・買い物リストを取得し、ビュー用プロパティに詰め替える内部処理。
    /// </summary>
    private async Task LoadPageAsync()
    {
        // カテゴリはプルダウン用に名前順で取得
        Categories = await _db.Categories
            .OrderBy(c => c.Name)
            .ToListAsync();

        // Item をカテゴリ名→品名の順でソートしながら読み込む
        var items = await _db.Items
            .Include(i => i.Category)
            .OrderBy(i => i.Category != null ? i.Category.Name : string.Empty)
            .ThenBy(i => i.Name)
            .ToListAsync();

        // Availability をディクショナリ化して参照しやすくする
        var availability = await _db.ItemAvailabilities
            .ToDictionaryAsync(a => a.ItemId);

        // Item + Availability を組み合わせてビュー用の ItemView リストを構築
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

        // 在庫なしのものだけが買い物リストに並ぶ
        BuyList = MasterItems
            .Where(x => !x.IsAvailable)
            .ToList();
    }
}
