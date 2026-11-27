using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Commerce.Infrastructure.Integrations;

public sealed record IntegrationStatusView(bool ProvisioningConfigured, bool Connected, string HostPlatform,
    string Status, Guid? ConnectionId, Guid? WorkspaceId, string WorkspaceName, string? HostCustomerId,
    string? HostProjectId, string? WebhookUrl, string ApiContractVersion, DateTime? LastConnectedAtUtc,
    DateTime? LastEventDeliveredAtUtc, string? LastError, int ActiveApiKeys, int PendingEvents,
    int FailedDeliveries, DateTime? ProvisionedAtUtc);

public sealed class IntegrationAdminService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IntegrationOptions _options;
    private readonly AuditService _audit;

    public IntegrationAdminService(CommerceDbContext db, ITenantContext tenant,
        IOptions<IntegrationOptions> options, AuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _options = options.Value;
        _audit = audit;
    }

    public async Task<IntegrationStatusView> GetStatusAsync(CancellationToken ct = default)
    {
        var workspace = await _db.Workspaces.AsNoTracking().FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct);
        var connection = await _db.AppConnections.AsNoTracking()
            .FirstOrDefaultAsync(c => c.WorkspaceId == _db.CurrentWorkspaceId, ct);
        var activeKeys = await _db.ApiClients.AsNoTracking()
            .CountAsync(c => !c.IsRevoked, ct);
        var pending = await _db.OutboxEvents.AsNoTracking()
            .CountAsync(e => e.Status == OutboxStatus.Pending || e.Status == OutboxStatus.Failed, ct);
        var failed = await _db.OutboxEvents.AsNoTracking()
            .CountAsync(e => e.Status == OutboxStatus.DeadLettered, ct);

        return new IntegrationStatusView(!string.IsNullOrWhiteSpace(_options.ProvisioningSecret),
            connection?.Status == ConnectionStatus.Active,
            connection?.HostPlatform ?? "Get Assist",
            (connection?.Status ?? ConnectionStatus.NotConnected).ToString(),
            connection?.Id, workspace.Id, workspace.Name, connection?.HostCustomerId, connection?.HostProjectId,
            connection?.WebhookUrl, connection?.ApiContractVersion ?? "v1", connection?.LastConnectedAtUtc,
            connection?.LastEventDeliveredAtUtc, connection?.LastError, activeKeys, pending, failed,
            connection?.ProvisionedAtUtc);
    }

    public async Task<IntegrationStatusView> DisableAsync(CancellationToken ct = default)
    {
        var connection = await _db.AppConnections.FirstOrDefaultAsync(c => c.WorkspaceId == _db.CurrentWorkspaceId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "This workspace is not connected to a host platform.");
        connection.Status = ConnectionStatus.Disabled;
        connection.DisabledAtUtc = DateTime.UtcNow;
        connection.LastError = "Disabled by workspace administrator.";

        // Disabling is reversible: keys stay valid but authentication rejects them while the
        // connection is inactive. RevokeAsync permanently revokes keys.

        _audit.Record("integration.disabled", "AppConnection", connection.Id.ToString(), null);
        await _db.SaveChangesAsync(ct);
        return await GetStatusAsync(ct);
    }

    public async Task<IntegrationStatusView> ReconnectAsync(string? webhookUrl, CancellationToken ct = default)
    {
        var connection = await _db.AppConnections.FirstOrDefaultAsync(c => c.WorkspaceId == _db.CurrentWorkspaceId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "This workspace is not connected to a host platform.");
        if (connection.Status == ConnectionStatus.Revoked)
            throw new DomainException(DomainErrors.InvalidState, "This connection has been revoked and must be re-provisioned.");
        if (!string.IsNullOrWhiteSpace(webhookUrl))
        {
            if (!Uri.TryCreate(webhookUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
                throw new DomainException(DomainErrors.Validation, "Webhook URL must be an absolute HTTPS URL.");
            connection.WebhookUrl = webhookUrl.Trim();
        }

        connection.Status = ConnectionStatus.Active;
        connection.LastConnectedAtUtc = DateTime.UtcNow;
        connection.DisabledAtUtc = null;
        connection.LastError = null;
        _audit.Record("integration.reconnected", "AppConnection", connection.Id.ToString(), null);
        await _db.SaveChangesAsync(ct);
        return await GetStatusAsync(ct);
    }

    public async Task<IntegrationStatusView> RevokeAsync(CancellationToken ct = default)
    {
        var connection = await _db.AppConnections.FirstOrDefaultAsync(c => c.WorkspaceId == _db.CurrentWorkspaceId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "This workspace is not connected to a host platform.");
        connection.Status = ConnectionStatus.Revoked;
        connection.LastError = "Connection revoked by workspace administrator.";

        var keys = await _db.ApiClients.Where(c => !c.IsRevoked).ToListAsync(ct);
        foreach (var key in keys)
        {
            key.IsRevoked = true;
            key.RevokedAtUtc = DateTime.UtcNow;
        }
        _audit.Record("integration.revoked", "AppConnection", connection.Id.ToString(), null);
        await _db.SaveChangesAsync(ct);
        return await GetStatusAsync(ct);
    }
}

/// <summary>
/// Drains the transactional outbox to the connected host platform with bounded exponential backoff,
/// delivery logs and dead-letter visibility. Host unavailability never breaks commerce transactions.
/// </summary>
public sealed class OutboxDispatcher : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IntegrationOptions _options;
    private readonly ILogger<OutboxDispatcher> _logger;

    public OutboxDispatcher(IServiceScopeFactory scopeFactory, IHttpClientFactory httpClientFactory,
        IOptions<IntegrationOptions> options, ILogger<OutboxDispatcher> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DispatchOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Outbox dispatch cycle failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Max(2, _options.EventDispatchSeconds)), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task<int> DispatchOnceAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CommerceDbContext>();
        var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        tenant.SetSystem();

        var now = DateTime.UtcNow;
        var events = await db.OutboxEvents
            .Where(e => (e.Status == OutboxStatus.Pending || e.Status == OutboxStatus.Failed)
                && e.NextAttemptAtUtc <= now)
            .OrderBy(e => e.OccurredAtUtc).Take(25).ToListAsync(ct);

        var delivered = 0;
        foreach (var evt in events)
        {
            var connection = await db.AppConnections.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.WorkspaceId == evt.WorkspaceId && c.Status == ConnectionStatus.Active, ct);
            if (connection is null || string.IsNullOrWhiteSpace(connection.WebhookUrl))
                continue; // Stay queued until a connection exists.

            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            var body = BuildEnvelope(evt);
            using var request = new HttpRequestMessage(HttpMethod.Post, connection.WebhookUrl)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            request.Headers.Add("X-Commerce-Event-Id", evt.Id.ToString());
            request.Headers.Add("X-Commerce-Event-Type", evt.Type);
            request.Headers.Add("X-Commerce-Timestamp", timestamp);
            if (!string.IsNullOrWhiteSpace(connection.WebhookSecret))
                request.Headers.Add("X-Commerce-Signature", $"sha256={Hmac.Sign(connection.WebhookSecret!, $"{timestamp}.{body}")}");

            var stopwatch = Stopwatch.StartNew();
            var success = false;
            int? statusCode = null;
            string? error = null;
            try
            {
                var client = _httpClientFactory.CreateClient("webhooks");
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeout.CancelAfter(TimeSpan.FromSeconds(10));
                using var response = await client.SendAsync(request, timeout.Token);
                statusCode = (int)response.StatusCode;
                success = response.IsSuccessStatusCode;
                if (!success) error = $"Webhook returned HTTP {statusCode}.";
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                error = ex.Message;
            }
            stopwatch.Stop();

            evt.Attempts++;
            if (success)
            {
                evt.Status = OutboxStatus.Delivered;
                evt.DeliveredAtUtc = DateTime.UtcNow;
                evt.LastError = null;
                connection.LastEventDeliveredAtUtc = DateTime.UtcNow;
                connection.LastError = null;
                delivered++;
            }
            else
            {
                evt.LastError = error;
                if (evt.Attempts >= Math.Max(1, _options.MaxDeliveryAttempts))
                {
                    evt.Status = OutboxStatus.DeadLettered;
                }
                else
                {
                    evt.Status = OutboxStatus.Failed;
                    var delaySeconds = Math.Min(3600, 30 * Math.Pow(2, evt.Attempts - 1));
                    evt.NextAttemptAtUtc = DateTime.UtcNow.AddSeconds(delaySeconds);
                }
                connection.LastError = error;
                _logger.LogWarning("Event {EventId} ({Type}) delivery failed on attempt {Attempts}: {Error}",
                    evt.Id, evt.Type, evt.Attempts, error);
            }

            db.DeliveryLogs.Add(new DeliveryLog
            {
                TenantId = evt.TenantId,
                WorkspaceId = evt.WorkspaceId,
                OutboxEventId = evt.Id,
                EventType = evt.Type,
                Attempt = evt.Attempts,
                Success = success,
                StatusCode = statusCode,
                Error = error,
                DurationMs = (int)stopwatch.ElapsedMilliseconds
            });

            await db.SaveChangesAsync(ct);
        }

        return delivered;
    }

    private static string BuildEnvelope(OutboxEvent evt)
    {
        JsonElement data;
        try
        {
            using var doc = JsonDocument.Parse(evt.PayloadJson);
            data = doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            data = JsonSerializer.SerializeToElement(new { raw = evt.PayloadJson });
        }

        return JsonSerializer.Serialize(new
        {
            id = evt.Id,
            type = evt.Type,
            version = evt.Version,
            occurredAt = evt.OccurredAtUtc,
            workspaceId = evt.WorkspaceId,
            subjectId = evt.SubjectId,
            data
        });
    }
}
