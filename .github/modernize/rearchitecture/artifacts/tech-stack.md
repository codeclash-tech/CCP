# Tech Stack

## Backend
- Node.js `>=20.19.0`
- Express `^4.21.2`
- Mongoose `^8.9.5`
- JSON Web Tokens `^9.0.2`
- Express rate limiting `^8.6.1`

## Frontend
- React `^19.2.7`
- React DOM `^19.2.7`
- React Router DOM `^7.3.0`
- Vite `^8.1.1`
- Axios `^1.20.0`
- Monaco Editor `^0.57.0`

## Persistence
- MongoDB is the runtime persistence target via Mongoose.
- `database/schema.prisma` declares MongoDB and unrelated challenge models.
- `database/schema.sql` is explicitly a reference schema, not runtime implementation.

## Secure Execution
- Spring Boot `4.0.8`
- Java `21`
- SpringDoc `3.1.1`
- Spring Boot Maven plugin

## Existing Migration Constraints
- Preserve Node/Mongoose APIs and Express route middleware.
- Preserve provider abstraction and secure Java execution boundary.
- Existing runtime content and version snapshots are Mongoose documents.
