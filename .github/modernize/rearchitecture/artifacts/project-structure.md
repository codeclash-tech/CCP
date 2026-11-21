# Project Structure

## Project Type
- Full-stack web platform plus desktop and secure Java execution components.

## Top-Level Modules
- `backend/`: Node.js/Express/Mongoose API and services.
- `frontend/`: React/Vite single-page application.
- `database/`: MongoDB/Prisma and reference SQL schema artifacts.
- `desktop/`: Electron-style desktop wrapper and Python support.
- `secure-code-engine/`: Spring Boot Java execution engine.
- `docs/`: operational and product documentation.

## Learning Architecture Layers
- Route declarations: `backend/src/routes/learningRoutes.js`
- Controllers: `backend/src/controllers/learningController.js`
- Domain orchestration: `backend/src/services/learningService.js`
- Objective evidence: `backend/src/services/learningObjectiveEngine.js`
- Provider/Java adapters: `learningAiProvider.js`, `executionService.js`
- Persistence: Mongoose learning models under `backend/src/models/`
- UI: `frontend/src/pages/LearningCenter.jsx`

## Entry Points
- Backend: `backend/src/server.js`
- Frontend: Vite entry under `frontend/src/`
- Secure engine: Spring Boot application/resource under `secure-code-engine/`
