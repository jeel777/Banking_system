const { z } = require('zod');

// MongoDB ObjectId validation regex
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const transferSchema = z.object({
    fromAccount: z
        .string({ required_error: "fromAccount is required" })
        .regex(objectIdRegex, "fromAccount must be a valid account ID"),
    toAccount: z
        .string({ required_error: "toAccount is required" })
        .regex(objectIdRegex, "toAccount must be a valid account ID"),
    amount: z
        .number({ required_error: "Amount is required" })
        .positive("Amount must be greater than 0")
        .max(1_000_000, "Amount cannot exceed 1,000,000 per transaction"),
    idempotencyKey: z
        .string({ required_error: "idempotencyKey is required" })
        .min(1, "idempotencyKey cannot be empty")
        .max(100, "idempotencyKey is too long"),
}).refine(data => data.fromAccount !== data.toAccount, {
    message: "Cannot transfer to the same account",
    path: ["toAccount"],
});

const initialFundsSchema = z.object({
    toAccount: z
        .string({ required_error: "toAccount is required" })
        .regex(objectIdRegex, "toAccount must be a valid account ID"),
    amount: z
        .number({ required_error: "Amount is required" })
        .positive("Amount must be greater than 0"),
    idempotencyKey: z
        .string({ required_error: "idempotencyKey is required" })
        .min(1, "idempotencyKey cannot be empty"),
});

const transactionHistorySchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(10).optional(),
    fromDate: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
    toDate: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
    type: z.enum(['sent', 'received']).optional(),
    minAmount: z.coerce.number().positive().optional(),
    maxAmount: z.coerce.number().positive().optional(),
    status: z.enum(['pending', 'completed', 'failed', 'reversed']).optional(),
});

module.exports = { transferSchema, initialFundsSchema, transactionHistorySchema };
