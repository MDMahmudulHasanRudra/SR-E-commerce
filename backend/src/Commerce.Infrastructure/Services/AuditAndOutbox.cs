using System.Text.Json;
using Commerce.Domain.Identity;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed class AuditService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;

    public AuditService(CommerceDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public void Record(string action, string entityType, string entityId, string? details = null)
    {
        if (!_tenant.HasTenant) return;
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = _tenant.TenantId,
            WorkspaceId = _tenant.WorkspaceId,
            UserId = _tenant.UserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = details
        });
    }
}

public sealed class OutboxService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;

    public OutboxService(CommerceDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    /// <summary>Queues a business event in the same database transaction as the business change.</summary>
    public OutboxEvent Enqueue(string type, string subjectId, object data, int version = 1)
    {
        var evt = new OutboxEvent
        {
            TenantId = _tenant.TenantId,
            WorkspaceId = _tenant.WorkspaceId,
            Type = type,
            Version = version,
            OccurredAtUtc = DateTime.UtcNow,
            SubjectId = subjectId,
            PayloadJson = JsonSerializer.Serialize(data),
            Status = Domain.OutboxStatus.Pending,
            NextAttemptAtUtc = DateTime.UtcNow
        };
        _db.OutboxEvents.Add(evt);
        return evt;
    }

    public async Task<IReadOnlyList<OutboxEvent>> ListAsync(int limit = 100, CancellationToken ct = default) =>
        await _db.OutboxEvents.OrderByDescending(e => e.OccurredAtUtc).Take(Math.Clamp(limit, 1, 500)).ToListAsync(ct);

    public async Task<IReadOnlyList<DeliveryLog>> ListDeliveriesAsync(Guid? eventId, int limit = 100, CancellationToken ct = default)
    {
        var query = _db.DeliveryLogs.AsQueryable();
        if (eventId is not null) query = query.Where(l => l.OutboxEventId == eventId);
        return await query.OrderByDescending(l => l.CreatedAtUtc).Take(Math.Clamp(limit, 1, 500)).ToListAsync(ct);
    }

    public async Task RetryAsync(Guid eventId, CancellationToken ct = default)
    {
        var evt = await _db.OutboxEvents.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return;
        evt.Status = Domain.OutboxStatus.Pending;
        evt.NextAttemptAtUtc = DateTime.UtcNow;
        evt.LastError = null;
        await _db.SaveChangesAsync(ct);
    }
}
