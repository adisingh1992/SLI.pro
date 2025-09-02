# Overview

SLI.pro is a professional branding management platform that helps users develop their professional identity through AI-powered insights and optimization tools. The application assists users in creating compelling Single Lasting Impressions (SLIs), optimizing their LinkedIn presence, and maintaining fresh professional profiles through comprehensive analysis and recommendations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development patterns
- **Routing**: Wouter for lightweight client-side routing with protected route implementation
- **State Management**: React Query (TanStack Query) for server state management with React Context for application-wide state
- **UI Components**: Custom component library built on Radix UI primitives with Tailwind CSS for styling
- **Form Handling**: React Hook Form with Zod validation for robust form management
- **Build Tool**: Vite for fast development and optimized production builds

## Backend Architecture
- **Runtime**: Node.js with Express.js framework for RESTful API endpoints
- **Language**: TypeScript for consistent type safety across the entire stack
- **Authentication**: Session-based authentication using Passport.js with Local Strategy
- **Password Security**: Scrypt-based password hashing with salt for secure credential storage
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple

## Database Design
- **Engine**: PostgreSQL 16 via Neon Database's serverless offering for scalability
- **ORM**: Drizzle ORM for type-safe database operations and migrations
- **Schema Management**: Drizzle Kit for version-controlled database schema evolution
- **Data Models**: 
  - User profiles with authentication and profile information
  - Document storage for resumes, LinkedIn profiles, and assessments
  - Conversation system for AI chat interactions
  - SLI (Single Lasting Impression) generation and refinement
  - Coaching notes and homework assignments for admin workflow
  - Freshness reports for profile analysis

## AI Integration Strategy
- **Primary Service**: Anthropic's Claude API (Claude-3-7-Sonnet) for high-quality text generation
- **Fallback Models**: Claude Haiku for faster, cost-effective operations like freshness reports
- **Rate Limiting**: Exponential backoff retry logic with configurable timeouts
- **Use Cases**:
  - Conversational coaching interactions
  - LinkedIn profile optimization recommendations
  - Resume and profile freshness analysis
  - SLI generation based on user data and documents
  - Content draft creation for LinkedIn posts

## File Upload and Document Management
- **Storage**: Base64 encoding for document content storage in PostgreSQL
- **Supported Types**: PDF documents, images, and text files up to 10MB
- **Document Categories**: Resume, LinkedIn profiles, certificates, assessments, and general documents
- **Processing**: Claude API integration for document analysis and insights

## Email Services
- **Provider**: SendGrid for transactional email delivery
- **Use Cases**: Password reset functionality with secure token-based verification
- **Configuration**: Environment-based API key management with fallback error handling

## Security Architecture
- **Authentication Flow**: Email/password with session persistence
- **Authorization**: Role-based access control with admin privileges for coaching features
- **Password Policy**: Minimum 8 characters with complexity requirements (uppercase, lowercase, numbers)
- **Session Security**: HTTP-only cookies with PostgreSQL session storage
- **Input Validation**: Zod schemas for consistent validation across client and server

## Admin Dashboard Features
- **User Management**: View all users, access profiles, and manage coaching relationships
- **SLI Generation**: AI-powered Single Lasting Impression creation for users
- **Coaching Tools**: Note-taking, homework assignment, and progress tracking
- **Content Analytics**: Conversation summaries and user engagement metrics

# External Dependencies

## AI and Machine Learning
- **Anthropic Claude API**: Primary AI service for conversational interactions, content generation, and document analysis
- **Model Selection**: Claude-3-7-Sonnet for complex tasks, Claude Haiku for performance-critical operations

## Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling
- **WebSocket Support**: For real-time features via @neondatabase/serverless

## Authentication and Communication
- **SendGrid**: Email delivery service for password resets and notifications
- **Passport.js**: Authentication middleware with local strategy implementation

## Development and Build Tools
- **Vite**: Frontend build tool with React plugin and development server
- **esbuild**: Backend bundling for production deployments
- **Drizzle Kit**: Database migration and schema management tools

## UI and Component Libraries
- **Radix UI**: Headless component primitives for accessibility and consistency
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent visual elements

## Form and Validation
- **React Hook Form**: Performant form library with minimal re-renders
- **Zod**: TypeScript-first schema validation for forms and API endpoints

## Development Environment
- **TypeScript**: Static typing across the entire application stack
- **Replit Platform**: Cloud-based development and deployment environment