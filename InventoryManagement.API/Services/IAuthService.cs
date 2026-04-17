namespace InventoryManagement.API.Services;

public interface IAuthService
{
    Task<string> LoginAsync(string email, string password);
    Task RegisterAsync(string username, string email, string password, string role, Guid? agencyId = null);
}
