using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace OrbisHub.CoreService.Middleware;

public class ValidateModelStateAttribute : ActionFilterAttribute
{
    public override void OnActionExecuting(ActionExecutingContext context)
    {
        if (!context.ModelState.IsValid)
        {
            var errors = context.ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .ToDictionary(
                    e => e.Key,
                    e => e.Value?.Errors.Select(er => er.ErrorMessage).ToArray() ?? Array.Empty<string>()
                );

            context.Result = new BadRequestObjectResult(new
            {
                error = "Validation failed",
                details = errors
            });
        }
    }
}
