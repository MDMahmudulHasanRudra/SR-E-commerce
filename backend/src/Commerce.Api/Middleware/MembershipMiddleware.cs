using System.Security.Claims;
using Commerce.Domain;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Api.Middleware;

/// <summary>
/// Verifies server-side membership for every authenticated JWT request and establishes tenant context.
/// Token claims are never trusted as authorization on their own.
/// </summary>
public sealed class MembershipMiddleware
{
    private readonly RequestDelegate _next;

    public MembershipMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, CommerceDbContext db, TenantContext tenant)
    {
        if (context.User.Identity?.IsAuthenticated != true
            || context.User.Identity.AuthenticationType == Auth.ApiKeyAuthenticationHandler.SchemeName)
        {
            await _next(context);
            return;
        }

        var userIdValue = context.User.FindFirstValue("sub")
            ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var tenantValue = context.User.FindFirstValue("tid");
        var workspaceValue = context.User.FindFirstValue("wid");

        if (!Guid.TryParse(userIdValue, out var userId)
            || !Guid.TryParse(tenantValue, out var tenantId)
            || !Guid.TryParse(workspaceValue, out var workspaceId))
        {
            await WriteErrorAsync(context, 401, "UNAUTHORIZED", "The session is missing tenant context. Sign in again.");
            return;
        }

        var membership = await db.Memberships.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId
                && m.WorkspaceId == workspaceId && m.IsActive, context.RequestAborted);
        if (membership is null)
        {
            await WriteErrorAsync(context, 403, "FORBIDDEN", "You do not have access to this workspace.");
            return;
        }

        var workspace = await db.Workspaces.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == workspaceId && w.TenantId == tenantId, context.RequestAborted);
        if (workspace is null || workspace.Status != Domain.WorkspaceStatus.Active)
        {
            await WriteErrorAsync(context, 403, "FORBIDDEN", "This workspace is not available.");
            return;
        }

        var user = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && u.TenantId == tenantId, context.RequestAborted);
        if (user is null || !user.IsActive)
        {
            await WriteErrorAsync(context, 403, "FORBIDDEN", "This account is not active.");
            return;
        }

        tenant.Set(tenantId, workspaceId, userId, membership.Role);
        context.Items["role"] = membership.Role.ToString();
        context.Items["membershipId"] = membership.Id;
        await _next(context);
    }

    private static async Task WriteErrorAsync(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            error = new { code, message },
            correlationId = context.Items["correlationId"]?.ToString()
        });
    }
}
