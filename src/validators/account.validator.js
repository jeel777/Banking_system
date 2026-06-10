const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

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
        .regex(objectIdRegex, "Invalid account ID format"),
});

module.exports = { createAccountSchema, accountIdParamSchema };
