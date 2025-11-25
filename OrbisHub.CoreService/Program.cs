using OrbisHub.CoreService.Configuration;
using OrbisHub.CoreService.Data;
using OrbisHub.CoreService.Services;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

// Configure as Windows Service
builder.Host.UseWindowsService();

// Configure Kestrel to listen on configured URL
var settings = builder.Configuration.GetSection("OrbisHub").Get<OrbisHubSettings>();
if (settings != null && !string.IsNullOrEmpty(settings.ServiceUrl))
{
    builder.WebHost.UseUrls(settings.ServiceUrl);
}

// Configure Windows Event Log logging
if (OperatingSystem.IsWindows())
{
    builder.Logging.AddEventLog(eventLogSettings =>
    {
        eventLogSettings.SourceName = "OrbisHub.CoreService";
    });
}

// Add services to the container
builder.Services.Configure<OrbisHubSettings>(builder.Configuration.GetSection("OrbisHub"));

// Register repositories
builder.Services.AddScoped<IAgentRepository, AgentRepository>();
builder.Services.AddScoped<IJobRepository, JobRepository>();

// Register background services
builder.Services.AddHostedService<DatabaseHealthService>();
builder.Services.AddHostedService<JobTimeoutService>();

// Add controllers
builder.Services.AddControllers();

// Add API documentation
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Global exception handler
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Unhandled exception in request pipeline");
        
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { error = "An internal server error occurred" });
    }
});

app.MapControllers();

// Add a health check endpoint
app.MapGet("/health", () => new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    version = "1.0.0"
});

// Log startup information
var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("OrbisHub Core Service starting...");
logger.LogInformation("Service URL: {Url}", settings?.ServiceUrl ?? "default");
logger.LogInformation("Connection String configured: {Configured}", 
    !string.IsNullOrEmpty(settings?.ConnectionString));

app.Run();
