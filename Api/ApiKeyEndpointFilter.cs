using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ShoppingListApp.Api;

public class ApiKeyEndpointFilter : IEndpointFilter
{
    private readonly ILogger<ApiKeyEndpointFilter> _logger;
    private readonly byte[]? _expectedKeyBytes;

    public ApiKeyEndpointFilter(IOptions<ApiOptions> options, ILogger<ApiKeyEndpointFilter> logger)
    {
        _logger = logger;
        var configuredKey = options.Value.Key?.Trim();
        if (!string.IsNullOrWhiteSpace(configuredKey))
        {
            _expectedKeyBytes = Encoding.UTF8.GetBytes(configuredKey);
        }
    }

    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        if (_expectedKeyBytes is null)
        {
            _logger.LogWarning("API key validation skipped because no key is configured (Api:Key)");
            return ValueTask.FromResult<object?>(Results.Unauthorized());
        }

        var providedKey = GetProvidedKey(context.HttpContext);
        if (string.IsNullOrWhiteSpace(providedKey))
        {
            return ValueTask.FromResult<object?>(Results.Unauthorized());
        }

        var providedBytes = Encoding.UTF8.GetBytes(providedKey);
        if (providedBytes.Length != _expectedKeyBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(providedBytes, _expectedKeyBytes))
        {
            return ValueTask.FromResult<object?>(Results.Unauthorized());
        }

        return next(context);
    }

    private static string? GetProvidedKey(HttpContext httpContext)
    {
        var headerKey = httpContext.Request.Headers["X-API-Key"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(headerKey))
        {
            return headerKey;
        }

        return httpContext.Request.Query["k"].FirstOrDefault();
    }
}
