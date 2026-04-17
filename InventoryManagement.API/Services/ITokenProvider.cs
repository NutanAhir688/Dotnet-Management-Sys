using InventoryManagement.API.Models;

namespace InventoryManagement.API.Services;

public interface ITokenProvider
{
    string GenerateToken(User user);
}
