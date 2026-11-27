using Commerce.Domain;
using Commerce.Domain.Common;

namespace Commerce.Infrastructure.Abstractions;

public interface ITenantContext
{
    Guid TenantId { get; }
    Guid WorkspaceId { get; }
    Guid? UserId { get; }
    UserRole? Role { get; }
    bool IsSystem { get; }
    bool HasTenant { get; }

    void SetSystem();
    void Set(Guid tenantId, Guid workspaceId, Guid? userId, UserRole? role);
}

public sealed class TenantContext : ITenantContext
{
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid? UserId { get; private set; }
    public UserRole? Role { get; private set; }
    public bool IsSystem { get; private set; }
    public bool HasTenant => TenantId != Guid.Empty && WorkspaceId != Guid.Empty;

    public void SetSystem() => IsSystem = true;

    public void Set(Guid tenantId, Guid workspaceId, Guid? userId, UserRole? role)
    {
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        UserId = userId;
        Role = role;
        IsSystem = false;
    }
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public static class Money
{
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal Percent(decimal amount, decimal percent) =>
        Round(amount * percent / 100m);
}

public sealed class PageQuery
{
    private int _page = 1;
    private int _pageSize = 20;

    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = Math.Clamp(value, 1, 200);
    }
}

public static class Paging
{
    public static PagedResult<T> ToPage<T>(IEnumerable<T> source, int page, int pageSize, int total)
        => new(source.ToList(), page, pageSize, total);
}
