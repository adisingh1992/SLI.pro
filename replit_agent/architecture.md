# Architecture Overview

## 1. Overview

SLI.pro is a professional profile management application designed to help users manage their professional profiles, receive AI-powered insights, and optimize their professional presence. The application features user authentication, profile management, document management, AI-powered conversations, and administrative capabilities.

The application follows a modern full-stack architecture with a clear separation between client and server components. It uses React for the frontend and Node.js with Express for the backend. The application leverages an AI service (Claude by Anthropic) to provide personalized insights and recommendations based on user profiles and documents.

## 2. System Architecture

The system follows a client-server architecture with the following main components:

### 2.1. Frontend (Client)

- **Framework**: React with TypeScript
- **UI Components**: Tailwind CSS with a component library built on top of Radix UI primitives
- **State Management**: React Query for server state, React Context for application state
- **Routing**: Wouter for lightweight routing
- **Form Handling**: React Hook Form with Zod for validation

### 2.2. Backend (Server)

- **Framework**: Express.js with TypeScript
- **API**: RESTful API endpoints for various resources
- **Authentication**: Session-based authentication with Passport.js
- **Database Access**: Drizzle ORM for database operations

### 2.3. Database

- **Engine**: PostgreSQL (provided by Neon Database's serverless offering)
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for schema migrations

### 2.4. AI Integration

- **Service**: Anthropic's Claude API
- **Capabilities**: 
  - Conversation generation
  - LinkedIn profile optimization
  - Resume/profile freshness analysis
  - SLI (Structured LinkedIn Identifiers) generation

### 2.5. Development and Deployment

- **Build Tool**: Vite for frontend, esbuild for backend
- **Deployment**: Supports deployment on Replit's platform
- **Environment**: Node.js 20 with PostgreSQL 16

## 3. Key Components

### 3.1. User Management

- **Authentication**: Session-based authentication with password hashing
- **User Profiles**: Comprehensive user profiles with personal and professional information
- **Admin Access**: Special administrative capabilities for managing users

### 3.2. Profile Management

- **Experiences**: Work experience tracking
- **Education**: Educational background management
- **Skills**: Professional skills tracking
- **Languages**: Language proficiency tracking

### 3.3. Document Management

- **Resume Upload**: Upload and management of resumes
- **LinkedIn Profile**: Upload and analysis of LinkedIn profiles
- **Other Documents**: Support for various document types (certificates, cover letters, etc.)

### 3.4. AI-Powered Features

- **Conversations**: AI-powered conversations with Claude for career guidance
- **Freshness Reports**: Analysis of profile freshness and recommendations
- **LinkedIn Optimization**: Recommendations for optimizing LinkedIn profiles
- **SLI Generation**: Generation of Structured LinkedIn Identifiers for profile optimization

### 3.5. Administrative Features

- **User Management**: Admin dashboard for user management
- **Coaching Notes**: Admin capabilities for adding coaching notes to user profiles
- **SLI Management**: Administrative tools for generating and managing SLIs

## 4. Data Flow

### 4.1. Authentication Flow

1. User submits login credentials
2. Server validates credentials using Passport.js
3. On success, a session is created and stored in the PostgreSQL database
4. Session ID is sent to the client as a cookie
5. Subsequent requests include the session cookie for authentication

### 4.2. Profile Data Flow

1. Client requests profile data via React Query
2. Server authenticates the request using the session cookie
3. Server retrieves data from the database using Drizzle ORM
4. Data is returned to the client as JSON
5. React Query caches the data for efficient access

### 4.3. AI Integration Flow

1. User initiates an AI-powered feature (conversation, analysis, etc.)
2. Server collects necessary data from the database
3. Server sends a request to the Anthropic Claude API with appropriate prompts
4. Claude responds with generated content
5. Server processes the response and stores relevant data in the database
6. Results are returned to the client

## 5. External Dependencies

### 5.1. Core Dependencies

- **@neondatabase/serverless**: PostgreSQL database provider
- **@anthropic-ai/sdk**: Anthropic Claude API integration
- **express**: Web server framework
- **passport**: Authentication middleware
- **drizzle-orm**: Database ORM
- **react**: Frontend UI library
- **react-query**: Data fetching and caching
- **tailwindcss**: Utility-first CSS framework
- **radix-ui**: UI component primitives

### 5.2. Development Dependencies

- **vite**: Frontend build tool
- **esbuild**: JavaScript/TypeScript bundler
- **typescript**: Type safety
- **drizzle-kit**: Database schema migration tool

## 6. Deployment Strategy

The application is configured for deployment on Replit's platform with the following characteristics:

### 6.1. Development Environment

- Uses Replit's Node.js 20 and PostgreSQL 16 modules
- Development server runs with `npm run dev` which executes `tsx server/index.ts`
- Hot module replacement is enabled for efficient development

### 6.2. Production Build

- Frontend is built using Vite (`vite build`)
- Backend is bundled using esbuild
- Output is placed in the `dist` directory
- Static assets are served from `dist/public`

### 6.3. Production Runtime

- Production server runs with `NODE_ENV=production node dist/index.js`
- Server is configured to listen on port 5000 (mapped to port 80 externally)
- Database connection is established using the `DATABASE_URL` environment variable

### 6.4. Environment Variables

- **DATABASE_URL**: PostgreSQL connection string
- **SESSION_SECRET**: Secret for session encryption
- **ANTHROPIC_API_KEY**: API key for Anthropic Claude integration
- **CLAUDE_MODEL**: Claude model version to use (defaults to latest available)

## 7. Security Considerations

### 7.1. Authentication

- Passwords are hashed using scrypt with salt
- Sessions are stored in the database with expiration
- CSRF protection is implemented

### 7.2. Data Protection

- Sensitive operations require authentication
- Resource access is restricted to the owning user
- Admin operations require admin privileges

### 7.3. API Security

- Input validation using Zod schemas
- Rate limiting for AI-powered features
- Error handling to prevent information leakage

## 8. Scaling Considerations

The application is designed with scalability in mind:

- Stateless server architecture allows horizontal scaling
- Database connection pooling for efficient resource usage
- Caching of API responses on the client using React Query
- Streaming responses for AI-generated content to improve perceived performance

While the current deployment is on Replit, the architecture would support deployment to other platforms like AWS, Google Cloud, or Azure with minimal changes.