# Authentication Configuration Guide

## Overview

The application uses **Better Auth** for user authentication with support for:
- Email/password authentication (sign up, sign in, password reset)
- OAuth providers: Google, GitHub, Apple
- Session management
- Email verification (optional)

## Authentication Features

### 1. Email/Password Authentication

**Sign Up:**
- POST `/api/auth/sign-up/email`
- Body: `{ email: string, password: string, name?: string }`
- Creates new user account

**Sign In:**
- POST `/api/auth/sign-in/email`
- Body: `{ email: string, password: string }`
- Returns session token

**Sign Out:**
- POST `/api/sign-out`
- Revokes current session

### 2. OAuth Sign-In

**Google/GitHub/Apple:**
- POST `/api/auth/sign-in/social`
- Body: `{ provider: 'google' | 'github' | 'apple', redirectURL: string }`
- Automatically creates account or logs in existing user

### 3. Session Management

**Get Current Session:**
- GET `/api/auth/get-session`
- Returns: `{ user, session, account }`

**Get Current User:**
- GET `/api/auth/user`
- Returns authenticated user info

**Get Auth Status:**
- GET `/api/auth/status`
- Returns: `{ authenticated: boolean, user: object, providers: string[] }`

**List Sessions:**
- GET `/api/auth/list-sessions`
- Returns all active sessions for user

**Revoke Session:**
- POST `/api/auth/revoke-session`
- Body: `{ sessionId: string }`
- Revokes specific session

### 4. Session Lifecycle

Sessions are managed automatically:
- Created on successful sign-in
- Stored securely with expiration time
- Validated on each protected route access
- Automatically revoked on sign-out

## OAuth Provider Setup

### Why No Configuration Needed

The framework provides an **OAuth proxy** that handles provider authentication automatically:
- No need to set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.
- No need to configure redirect URIs in each provider's console
- Works out-of-the-box with automatic proxying

### Supported Providers

1. **Google OAuth**
   - Enabled by default
   - Endpoint: `/api/auth/sign-in/social?provider=google`

2. **GitHub OAuth**
   - Enabled by default
   - Endpoint: `/api/auth/sign-in/social?provider=github`

3. **Apple Sign-in**
   - Enabled by default
   - Endpoint: `/api/auth/sign-in/social?provider=apple`

## Using Better Auth Endpoints

All authentication endpoints are handled by Better Auth automatically. **DO NOT create custom endpoints at `/api/auth/*`** - they conflict with Better Auth's reserved paths.

### Reserved Endpoint Paths

```
/api/auth/*
```

All authentication is managed through Better Auth's endpoints:
- `/api/auth/sign-up/email` - Register with email/password
- `/api/auth/sign-in/email` - Login with email/password
- `/api/auth/sign-in/social` - OAuth sign-in
- `/api/auth/sign-out` - Logout
- `/api/auth/get-session` - Get current session
- `/api/auth/user` - Get current user
- `/api/auth/change-password` - Change password
- `/api/auth/reset-password` - Reset password
- `/api/auth/verify-email` - Verify email
- `/api/auth/change-email` - Change email
- `/api/auth/update-user` - Update profile
- `/api/auth/delete-user` - Delete account
- etc. (full list in Better Auth documentation)

## Custom Auth Routes

This application adds custom endpoints on top of Better Auth:

### GET `/api/auth/status`
Returns current authentication status with available providers.
**Response:**
```json
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "name": "..." },
  "session": { "id": "...", "expiresAt": "..." },
  "providers": ["google", "github", "apple"]
}
```

### GET `/api/auth/user`
Returns current authenticated user information (requires authentication).

### POST `/api/auth/logout`
Sign out current user (requires authentication).

### GET `/api/auth/providers`
Returns list of available OAuth providers.

## Protecting Routes

To protect a route, use the `requireAuth` middleware:

```typescript
export function registerUserRoutes(app: App) {
  const requireAuth = app.requireAuth();

  app.fastify.get("/api/users/me", async (request, reply) => {
    const session = await requireAuth(request, reply);
    if (!session) return; // Automatically sends 401 if not authenticated

    // session.user contains authenticated user info
    return { user: session.user };
  });
}
```

## Error Handling

All authentication errors return JSON with proper error messages (not empty objects):

**Format:**
```json
{
  "error": "ErrorType",
  "message": "Human readable error message",
  "details": { /* optional additional info */ }
}
```

**Common Error Codes:**
- 400 Bad Request - Invalid input
- 401 Unauthorized - Authentication required or failed
- 403 Forbidden - Insufficient permissions
- 404 Not Found - Resource not found
- 500 Internal Server Error - Server error

**Example Error Responses:**
```json
{
  "error": "InvalidCredentials",
  "message": "Invalid email or password"
}
```

```json
{
  "error": "EmailAlreadyExists",
  "message": "An account with this email already exists"
}
```

## Security Features

### Password Requirements
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

### Session Security
- Sessions stored with secure tokens
- Automatic expiration
- CSRF protection enabled
- Secure cookie handling

### User Data Protection
- Passwords hashed securely (bcrypt)
- Sensitive data never exposed in responses
- Email verification available (optional)

## Environment Variables

No OAuth credentials needed! The framework handles everything.

For email features (optional):
```bash
RESEND_API_KEY=your_resend_key  # For sending verification/password reset emails
```

## API Documentation

Access interactive API documentation:
- **OpenAPI Schema**: `GET /api/auth/open-api/generate-schema`
- **API Reference**: `GET /api/auth/reference`
- **Better Auth Docs**: https://better-auth.com/docs

## Testing Authentication

### Using cURL

**Sign Up:**
```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe"
  }'
```

**Sign In:**
```bash
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

**Get Auth Status:**
```bash
curl http://localhost:3000/api/auth/status
```

## Troubleshooting

### Empty Error Objects
**Fixed!** The application now returns detailed error messages with proper JSON format.

### OAuth Not Working
- OAuth is automatically configured via the framework
- No manual credential setup required
- Check that the app is running on the correct URL

### Session Not Persisting
- Sessions are stored in the database
- Verify database connection is working
- Check session expiration settings

### Password Reset Not Working
- Requires email provider configuration (Resend)
- Set `RESEND_API_KEY` environment variable
- Verify email templates are configured

## Next Steps

1. Set up your frontend to call `/api/auth/status` on app load
2. Handle sign-in redirects from OAuth providers
3. Store session tokens from successful authentication
4. Use `requireAuth` middleware to protect routes
5. Implement refresh token logic for long-lived sessions
