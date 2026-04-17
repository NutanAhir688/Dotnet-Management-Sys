using InventoryManagement.API.Data;
using InventoryManagement.API.Models;
using Microsoft.EntityFrameworkCore;

namespace InventoryManagement.API.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenProvider _tokenProvider;

    public AuthService(AppDbContext context, IPasswordHasher passwordHasher, ITokenProvider tokenProvider)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _tokenProvider = tokenProvider;
    }

    public async Task<string> LoginAsync(string email, string password)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || !_passwordHasher.VerifyPassword(password, user.PasswordHash))
            throw new InvalidOperationException("Invalid email or password.");

        return _tokenProvider.GenerateToken(user);
    }

    public async Task RegisterAsync(string username, string email, string password, string role, Guid? agencyId = null)
    {
        var emailExists = await _context.Users.AnyAsync(u => u.Email == email);
        if (emailExists)
            throw new InvalidOperationException("A user with this email already exists.");

        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = _passwordHasher.HashPassword(password),
            Role = role,
            AgencyId = agencyId
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();
    }
}
