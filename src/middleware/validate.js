const AppError = require('../utils/AppError');

/**
 * Generic validation middleware factory.
 * Validates request data against a Zod schema.
 * 
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'query' | 'params'} source - Where to find the data to validate
 * @returns {Function} Express middleware function
 * 
 * Usage:
 *   router.post('/register', validate(registerSchema), registerController);
 *   router.get('/transactions', validate(historySchema, 'query'), historyController);
 */
const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            const errors = result.error.errors.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));

            const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');

            throw new AppError(message, 400);
        }

        // Replace the source data with parsed/transformed data (trimmed, lowercased, etc.)
        req[source] = result.data;
        next();
    };
};

module.exports = validate;
