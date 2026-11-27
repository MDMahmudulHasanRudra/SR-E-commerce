using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Commerce.Api.Auth;
using Commerce.Api.Endpoints;
using Commerce.Api.Middleware;
using Commerce.Infrastructure;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCommerceInfrastructure(builder.Configuration);
builder.Services.AddScoped<TokenService>();
builder.Services.AddSingleton<SigningKeyProvider>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var authOptions = builder.Configuration.GetSection("Auth").Get<AuthOptions>() ?? new AuthOptions();

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer()
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthenticationHandler>(
        ApiKeyAuthenticationHandler.SchemeName, _ => { });

builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<SigningKeyProvider>((options, keys) =>
    {
        options.RequireHttpsMetadata = false;
        options.MapInboundClaims = false;
        options.SaveToken = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = authOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = authOptions.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keys.Key)),
            NameClaimType = "name",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization(Policies.Configure);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:3000"];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

if (builder.Configuration.GetValue("RateLimiting:Enabled", true))
{
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
            }));
        options.AddPolicy("integration", context =>
        {
            var key = context.Request.Headers["X-Api-Key"].ToString();
            var partition = string.IsNullOrWhiteSpace(key)
                ? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous"
                : key[..Math.Min(key.Length, 24)];
            return RateLimitPartition.GetFixedWindowLimiter(partition,
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 180, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
                });
        });
        options.AddPolicy("provisioning", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
            }));
    });
}

builder.Services.AddOpenApi();

var app = builder.Build();

app.UseMiddleware<CorrelationMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();

if (app.Configuration.GetValue("RateLimiting:Enabled", true))
    app.UseRateLimiter();

app.UseCors();
app.UseAuthentication();
app.UseMiddleware<MembershipMiddleware>();
app.UseAuthorization();

app.MapGet("/health/live", () => Results.Ok(new { status = "ok", service = "commerce-api", at = DateTime.UtcNow }))
    .AllowAnonymous().WithTags("Health");

app.MapGet("/health/ready", async (CommerceDbContext db, CancellationToken ct) =>
    {
        var ok = await db.Database.CanConnectAsync(ct);
        return ok
            ? Results.Ok(new { status = "ready", database = "reachable", at = DateTime.UtcNow })
            : Results.Json(new { status = "not-ready", database = "unreachable" }, statusCode: 503);
    })
    .AllowAnonymous().WithTags("Health");

app.MapOpenApi("/openapi/v1.json").AllowAnonymous();

app.MapGet("/docs", () => Results.Content("""
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Commerce ERP API</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
        <style>body{margin:0;background:#0b1220} .topbar{display:none}</style>
      </head>
      <body>
        <div id="swagger"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
          window.onload = () => SwaggerUIBundle({ url: '/openapi/v1.json', dom_id: '#swagger', deepLinking: true });
        </script>
      </body>
    </html>
    """, "text/html")).AllowAnonymous();

app.MapAuthEndpoints();
app.MapCatalogEndpoints();
app.MapPricingEndpoints();
app.MapInventoryEndpoints();
app.MapCustomerEndpoints();
app.MapOrderEndpoints();
app.MapPurchasingEndpoints();
app.MapFinanceEndpoints();
app.MapSettingsEndpoints();
app.MapReportEndpoints();
app.MapIntegrationEndpoints();

await InitializeAsync(app);

app.Run();

static async Task InitializeAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    var db = scope.ServiceProvider.GetRequiredService<CommerceDbContext>();
    var provider = (app.Configuration["Database:Provider"] ?? "postgres").ToLowerInvariant();

    if (app.Configuration.GetValue("Database:Initialize", true))
    {
        for (var attempt = 1; attempt <= 10; attempt++)
        {
            try
            {
                if (provider == "sqlite")
                    await db.Database.EnsureCreatedAsync();
                else
                    await db.Database.MigrateAsync();
                break;
            }
            catch (Exception ex) when (attempt < 10)
            {
                logger.LogWarning(ex, "Database not ready (attempt {Attempt}/10). Retrying in 3s.", attempt);
                await Task.Delay(TimeSpan.FromSeconds(3));
            }
        }
    }

    if (app.Configuration.GetValue("Seed:DemoAccount", false))
    {
        try
        {
            var anyTenants = await db.Tenants.IgnoreQueryFilters().AnyAsync();
            if (!anyTenants)
            {
                var auth = scope.ServiceProvider.GetRequiredService<AuthService>();
                var email = app.Configuration["Seed:DemoEmail"] ?? "admin@commerce.local";
                var password = app.Configuration["Seed:DemoPassword"] ?? "Admin123!";
                var company = app.Configuration["Seed:DemoCompany"] ?? "Northwind Commerce";
                await auth.RegisterAsync(new RegisterRequest(company, "Alex Morgan", email, password,
                    "Main Store", "USD", true));
                logger.LogInformation("Seeded demo workspace {Company} with login {Email}.", company, email);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Demo data seeding failed.");
        }
    }
}

public partial class Program;
