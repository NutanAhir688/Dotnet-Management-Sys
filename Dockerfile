# Stage 1: Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["InventoryManagement.API/InventoryManagement.API.csproj", "InventoryManagement.API/"]
RUN dotnet restore "InventoryManagement.API/InventoryManagement.API.csproj"

# Copy the rest of the files
COPY . .
WORKDIR "/src/InventoryManagement.API"

# Build the application
RUN dotnet build "InventoryManagement.API.csproj" -c Release -o /app/build

# Stage 2: Publish stage
FROM build AS publish
RUN dotnet publish "InventoryManagement.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 3: Final stage (Runtime)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:80
COPY --from=publish /app/publish .

# Expose ports
EXPOSE 80

# Set the entry point
ENTRYPOINT ["dotnet", "InventoryManagement.API.dll"]
