import type { FastifyReply } from 'fastify';

/**
 * Standard error response format for authentication endpoints
 */
export interface AuthErrorResponse {
  error: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Send authentication error response with proper JSON formatting
 */
export function sendAuthError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  message: string,
  details?: Record<string, any>
): FastifyReply {
  return reply.status(statusCode).send({
    error,
    message,
    ...(details && { details }),
  } as AuthErrorResponse);
}

/**
 * Send authentication success response
 */
export function sendAuthSuccess(
  reply: FastifyReply,
  statusCode: number,
  data: Record<string, any>
): FastifyReply {
  return reply.status(statusCode).send(data);
}

/**
 * Common authentication error messages
 */
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: {
    statusCode: 401,
    error: 'InvalidCredentials',
    message: 'Invalid email or password',
  },
  EMAIL_NOT_VERIFIED: {
    statusCode: 401,
    error: 'EmailNotVerified',
    message: 'Email address has not been verified',
  },
  EMAIL_ALREADY_EXISTS: {
    statusCode: 400,
    error: 'EmailAlreadyExists',
    message: 'An account with this email already exists',
  },
  INVALID_EMAIL: {
    statusCode: 400,
    error: 'InvalidEmail',
    message: 'Please provide a valid email address',
  },
  WEAK_PASSWORD: {
    statusCode: 400,
    error: 'WeakPassword',
    message: 'Password does not meet security requirements',
  },
  SESSION_EXPIRED: {
    statusCode: 401,
    error: 'SessionExpired',
    message: 'Your session has expired. Please sign in again',
  },
  UNAUTHORIZED: {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Authentication required',
  },
  FORBIDDEN: {
    statusCode: 403,
    error: 'Forbidden',
    message: 'Access denied',
  },
  NOT_FOUND: {
    statusCode: 404,
    error: 'NotFound',
    message: 'Resource not found',
  },
  INTERNAL_ERROR: {
    statusCode: 500,
    error: 'InternalError',
    message: 'An unexpected error occurred',
  },
};

/**
 * OAuth provider configuration
 */
export const OAUTH_PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google',
    enabled: true,
  },
  github: {
    id: 'github',
    name: 'GitHub',
    enabled: true,
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    enabled: true,
  },
};

/**
 * Get available OAuth providers
 */
export function getAvailableProviders(): string[] {
  return Object.values(OAUTH_PROVIDERS)
    .filter((p) => p.enabled)
    .map((p) => p.id);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isStrongPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return strongPasswordRegex.test(password);
}

/**
 * Sanitize user data for response (remove sensitive info)
 */
export function sanitizeUser(user: any): Record<string, any> {
  const { password, ...sanitized } = user;
  return sanitized;
}
