# ResXcan Server

Production-ready Express.js server with TypeScript, MongoDB, and MVC architecture.

## Features

- ✅ TypeScript with strict mode
- ✅ Express.js with middleware chain
- ✅ MongoDB connection with Mongoose
- ✅ MVC architecture (Routes, Controllers, Services)
- ✅ Comprehensive error handling
- ✅ Request logging with Morgan
- ✅ Security middleware (Helmet, CORS, Rate Limiting)
- ✅ Environment configuration
- ✅ ESLint configuration
- ✅ Graceful shutdown handling

## Project Structure

```
server/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.ts  # MongoDB connection
│   │   └── env.ts       # Environment variables
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── routes/          # Route definitions
│   ├── middlewares/     # Custom middlewares
│   ├── models/          # Mongoose models
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript type definitions
│   ├── app.ts           # Express app setup
│   └── index.ts         # Entry point
├── .env.example         # Environment variables template
├── nodemon.json         # Nodemon configuration
├── tsconfig.json        # TypeScript configuration
└── package.json
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or remote)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB URI and other configurations.

### Running the Server

**Development mode (with hot reload):**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Start production server:**
```bash
npm start
```

**Type checking:**
```bash
npm run type-check
```

**Linting:**
```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

## Environment Variables

See `.env.example` for required environment variables:

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `CORS_ORIGIN` - Allowed CORS origin
- And more...

## API Endpoints

### Health Check
- `GET /health` - Server health status

## Adding New Features

Follow the MVC pattern:

1. **Create a Model** (if needed) in `src/models/`
2. **Create a Service** in `src/services/` for business logic
3. **Create a Controller** in `src/controllers/` for request handling
4. **Create Routes** in `src/routes/` and mount them in `app.ts`

Example:
```typescript
// src/services/user.service.ts
export class UserService {
  async getUsers() {
    // Business logic
  }
}

// src/controllers/user.controller.ts
export const getUsers = asyncHandler(async (req, res) => {
  const users = await userService.getUsers();
  return ApiResponseHelper.success(res, users);
});

// src/routes/user.routes.ts
router.get('/', getUsers);

// src/app.ts
app.use('/api/v1/users', userRoutes);
```

## Architecture Patterns

- **MVC**: Routes → Controllers → Services → Models
- **Error Handling**: Centralized error handler middleware
- **Async Operations**: Use `asyncHandler` wrapper for route handlers
- **Response Format**: Consistent API response structure via `ApiResponseHelper`

## Production Considerations

- Environment variables are validated on startup
- Graceful shutdown handling (SIGTERM, SIGINT)
- Connection pooling for MongoDB
- Rate limiting for API routes
- Security headers via Helmet
- Request compression
- Comprehensive logging

