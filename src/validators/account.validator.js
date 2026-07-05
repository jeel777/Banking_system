const { z } = require('zod');

// UUID validation regex (PostgreSQL uses UUIDs instead of MongoDB ObjectIds)
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const createAccountSchema = z.object({
    currency: z
        .string()
        .length(3, "Currency must be a 3-letter code (e.g., INR, USD)")
        .toUpperCase()
        .default('INR')
        .optional(),
});

const accountIdParamSchema = z.object({
    accountId: z
        .string({ required_error: "Account ID is required" })
        .regex(uuidRegex, "Invalid account ID format"),
});

module.exports = { createAccountSchema, accountIdParamSchema };
