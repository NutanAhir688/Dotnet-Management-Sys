namespace InventoryManagement.API.DTOs;

public record LoginRequest(string Email, string Password);

public record RegisterRequest(string Username, string Email, string Password, string Role, Guid? AgencyId = null);

public record AuthResponse(string Token);
