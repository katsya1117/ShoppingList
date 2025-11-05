// DbContextが定義
using Microsoft.EntityFrameworkCore;
using ShoppingListApp.Models;

namespace ShoppingListApp.Data;

// アプリ全体のデータベースへの入り口
// ここで定義したクラスをDIコンテナに登録して、コントローラやAPIエンドポイントから注入して使う

public class AppDbContext : DbContext
{
    //    これは コンストラクタの依存性注入（DI）対応版
    //    DbContextOptions には「どのDBを使うか」「接続文字列は？」などの設定が入る
    //    base(o) で、親クラス（DbContext）のコンストラクタにその設定を渡す
    //    DIコンテナでbuilder.Services...で登録するときにオプションを紐づけるために使う
    public AppDbContext(DbContextOptions<AppDbContext> o) : base(o) { }
    //DbSet<T> は「データベースの1テーブル」に対応するコレクション。このコレクションの操作がSQLを発行
    public DbSet<Item> Items => Set<Item>();
    public DbSet<ItemAvailability> ItemAvailabilities => Set<ItemAvailability>();
    public DbSet<Category> Categories => Set<Category>();
    //テーブルのリレーションなどを構築するためのメソッド
    protected override void OnModelCreating(ModelBuilder b)
    {
        //ItemAvailability テーブルに関する設定を始める。
        b.Entity<ItemAvailability>()
          //主キーを ItemId に指定
         .HasKey(a => a.ItemId);

        b.Entity<ItemAvailability>()
          //ItemAvailability が 1つの Item に属している（所有している） ことを示す
         .HasOne(a => a.Item)
          //対応する側（Item）も1つの ItemAvailability を持つ。
          //つまり 1:1の関係 になる（WithMany() なら1:N）
         .WithOne()
          //外部キーの指定
         .HasForeignKey<ItemAvailability>(a => a.ItemId) 
          //親 Item が削除されたとき、その関連 ItemAvailability も自動削除（カスケード削除）
         .OnDelete(DeleteBehavior.Cascade);
    }
}
