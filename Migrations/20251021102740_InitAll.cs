using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoppingListApp.Migrations
{
    /// <inheritdoc />
    public partial class InitAll : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ItemAvailabilities_Items_ItemId1",
                table: "ItemAvailabilities");

            migrationBuilder.DropIndex(
                name: "IX_ItemAvailabilities_ItemId1",
                table: "ItemAvailabilities");

            migrationBuilder.DropColumn(
                name: "ItemId1",
                table: "ItemAvailabilities");

            migrationBuilder.AlterColumn<int>(
                name: "ItemId",
                table: "ItemAvailabilities",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER")
                .OldAnnotation("Sqlite:Autoincrement", true);

            migrationBuilder.AddForeignKey(
                name: "FK_ItemAvailabilities_Items_ItemId",
                table: "ItemAvailabilities",
                column: "ItemId",
                principalTable: "Items",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ItemAvailabilities_Items_ItemId",
                table: "ItemAvailabilities");

            migrationBuilder.AlterColumn<int>(
                name: "ItemId",
                table: "ItemAvailabilities",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER")
                .Annotation("Sqlite:Autoincrement", true);

            migrationBuilder.AddColumn<int>(
                name: "ItemId1",
                table: "ItemAvailabilities",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_ItemAvailabilities_ItemId1",
                table: "ItemAvailabilities",
                column: "ItemId1");

            migrationBuilder.AddForeignKey(
                name: "FK_ItemAvailabilities_Items_ItemId1",
                table: "ItemAvailabilities",
                column: "ItemId1",
                principalTable: "Items",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
