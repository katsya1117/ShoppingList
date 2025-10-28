using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoppingListApp.Migrations
{
    /// <inheritdoc />
    public partial class AddCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "name",
                table: "Items",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "Items",
                newName: "Id");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Items",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Items");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "Items",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "Items",
                newName: "id");
        }
    }
}
