const { z } = require('zod');

const registerSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .email("Please provide a valid email address")
        .trim()
        .toLowerCase(),
    name: z
        .string({ required_error: "Name is required" })
        .min(2, "Name must be at least 2 characters long")
        .max(50, "Name must not exceed 50 characters")
        .trim(),
    password: z
        .string({ required_error: "Password is required" })
        .min(6, "Password must be at least 6 characters long")
        .max(128, "Password must not exceed 128 characters")
        .regex(/[a-zA-Z]/, "Password must contain at least one letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

const loginSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .email("Please provide a valid email address")
        .trim()
        .toLowerCase(),
    password: z
        .string({ required_error: "Password is required" })
        .min(1, "Password is required"),
});

module.exports = { registerSchema, loginSchema };

// zod is javascript library for data validation.
