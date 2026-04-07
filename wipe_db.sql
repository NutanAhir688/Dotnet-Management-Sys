USE [InventoryManagementDb];
GO

-- Disable all foreign key constraints
EXEC sp_MSforeachtable "ALTER TABLE ? NOCHECK CONSTRAINT ALL";
GO

-- Delete all data from all tables
-- The order doesn't matter much since constraints are disabled, but we'll do it safely
DELETE FROM [OrderItems];
DELETE FROM [Bills];
DELETE FROM [Orders];
DELETE FROM [Customers];
DELETE FROM [Products];
DELETE FROM [Users];
DELETE FROM [Agencies];
GO

-- Reseed identity columns
DBCC CHECKIDENT ('OrderItems', RESEED, 0);
DBCC CHECKIDENT ('Bills', RESEED, 0);
DBCC CHECKIDENT ('Orders', RESEED, 0);
DBCC CHECKIDENT ('Customers', RESEED, 0);
DBCC CHECKIDENT ('Products', RESEED, 0);
DBCC CHECKIDENT ('Users', RESEED, 0);
DBCC CHECKIDENT ('Agencies', RESEED, 0);
GO

-- Re-enable all foreign key constraints
EXEC sp_MSforeachtable "ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL";
GO
