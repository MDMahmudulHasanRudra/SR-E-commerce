using System.Security.Cryptography;
using System.Text;

namespace Commerce.Infrastructure.Security;

public static class Hmac
{
    public static string Sign(string secret, string payload)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    public static bool Verify(string secret, string payload, string providedSignature)
    {
        if (string.IsNullOrWhiteSpace(providedSignature)) return false;
        var signature = providedSignature.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase)
            ? providedSignature[7..]
            : providedSignature;
        var expected = Sign(secret, payload);
        if (signature.Length != expected.Length) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(signature.ToLowerInvariant()),
            Encoding.UTF8.GetBytes(expected));
    }

    public static bool VerifyProvisioning(string secret, string timestamp, string rawBody, string signature)
    {
        if (!long.TryParse(timestamp, out var unix)) return false;
        var at = DateTimeOffset.FromUnixTimeSeconds(unix);
        if ((DateTimeOffset.UtcNow - at).Duration() > TimeSpan.FromMinutes(5)) return false;
        return Verify(secret, $"{timestamp}.{rawBody}", signature);
    }
}
