using System.ComponentModel.DataAnnotations;

namespace OrbisHub.CoreService.Validation;

public static class ValidationHelper
{
    public static (bool IsValid, List<string> Errors) ValidateObject(object obj)
    {
        var context = new ValidationContext(obj);
        var results = new List<ValidationResult>();
        var isValid = Validator.TryValidateObject(obj, context, results, true);

        var errors = results.Select(r => r.ErrorMessage ?? "Unknown validation error").ToList();
        return (isValid, errors);
    }

    public static bool IsValidGuid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        return Guid.TryParse(value, out _);
    }

    public static bool IsValidJobStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return false;

        var validStatuses = new[] { "Pending", "InProgress", "Succeeded", "Failed", "Timeout" };
        return validStatuses.Contains(status, StringComparer.OrdinalIgnoreCase);
    }
}
