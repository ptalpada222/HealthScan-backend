# HealthScan Backend

HealthScan Backend is a RESTful API for user authentication, health profiling, and AI-powered food product safety analysis.

## Features

- **User Authentication:** Sign up and login via phone number, email, and password.
- **Health Profile:** Create, update, and store user health profiles.
- **Food Product Analysis:** Upload a food product image with a user’s health profile. The backend uses the Gemini AI API to analyze if the product is safe for the user’s health profile.

## Tech Stack

- **Backend:**  Node.js with Express
- **Database:** MongoDB
- **Authentication:** JWT, sessions, jsonwebtoken
- **External APIs:** Gemini AI

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [MongoDB] instance running (if used)
- Gemini API Key

### Installation

```bash
git clone https://github.com/yourusername/healthscan-backend.git
cd healthscan-backend
npm install
```

### Environment Variables

Create a `.env` file in the root directory and add the following:

```
PORT=3000
DATABASE_URL=your_database_url
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_jwt_secret
MONGODB_URI=your mongodb url
CORS_ORIGIN=*
ACCESS_TOKEN_SECRET=your asccess key
ACCESS_TOKEN_EXPIRY=your expiry day
REFRESH_TOKEN_SECRET=your refresh key
REFRESH_TOKEN_EXPIRY=your expiry days
```

### Running the Server

```bash
npm run dev
```

## API Endpoints

### Auth

- **POST `http://localhost:5000/api/v1/register`**  
- **POST `http://localhost:5000/api/v1/login`**  
- **POST `http://localhost:5000/api/v1/refresh-token`**  
  

### Health Profile

- **POST `http://localhost:5000/api/v1/user/health-profile`**
- **GET `http://localhost:5000/api/v1/user/profile`**

### Food Product Analysis

- **POST `/api/v1/health/analyze-health`**  
  Request: Auth token required  
  - Form-data:  
    - `foodImage`: food product image file  

  The server sends the image and health profile data to the Gemini AI API.  

## Usage Example

1. Sign up or log in to get your auth token.
2. Create your health profile.
3. Upload a food product image and your profile to check if the food is safe for you.

## Contributing

Pull requests are welcome! Please submit bug reports and feature requests via issues.

## License

[MIT](LICENSE)

## Authors

- [Prakash Talpada](https://github.com/ptalpada222)
