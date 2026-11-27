using System.Text.Json;
using Commerce.Domain.Common;

namespace Commerce.Api.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            var status = ex.Code switch
            {
                DomainErrors.NotFound => StatusCodes.Status404NotFound,
                DomainErrors.Validation => StatusCodes.Status400BadRequest,
                DomainErrors.Conflict or DomainErrors.InsufficientStock or DomainErrors.InvalidState => StatusCodes.Status409Conflict,
                DomainErrors.Forbidden => StatusCodes.Status403Forbidden,
                DomainErrors.Unauthorized => StatusCodes.Status401Unauthorized,
                _ => StatusCodes.Status400BadRequest
            };
            await WriteAsync(context, status, ex.Code, ex.Message);
        }
        catch (BadHttpRequestException ex)
        {
            await WriteAsync(context, StatusCodes.Status400BadRequest, "INVALID_REQUEST", ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled error for {Method} {Path} (correlation {CorrelationId})",
                context.Request.Method, context.Request.Path, context.Items["correlationId"]);
            await WriteAsync(context, StatusCodes.Status500InternalServerError, "INTERNAL_ERROR",
                "An unexpected error occurred. Reference the correlation ID when contacting support.");
        }
    }

    private static async Task WriteAsync(HttpContext context, int status, string code, string message)
    {
        if (context.Response.HasStarted) return;
        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            error = new { code, message },
            correlationId = context.Items["correlationId"]?.ToString()
        }, JsonOptions));
    }
}

public sealed class CorrelationMiddleware
{
    public const string Header = "X-Correlation-ID";
    private readonly RequestDelegate _next;

    public CorrelationMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var id = context.Request.Headers[Header].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(id) || id.Length > 100) id = Guid.NewGuid().ToString("N");
        context.Items["correlationId"] = id;
        context.Response.Headers[Header] = id;
        using var scope = context.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("Request").BeginScope(new { correlationId = id });
        await _next(context);
    }
}

public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string[] _allowedParents;

    public SecurityHeadersMiddleware(RequestDelegate next, IConfiguration configuration)
    {
        _next = next;
        _allowedParents = (configuration["HostPlatform:AllowedParentOrigins"] ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Content-Security-Policy"] =
            $"frame-ancestors {( _allowedParents.Length == 0 ? "'none'" : string.Join(' ', _allowedParents))};";
        await _next(context);
    }
}
