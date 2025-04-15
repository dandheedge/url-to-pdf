# URL to PDF Converter

A Next.js application that converts web pages to PDF using Browserless and Puppeteer.

## Features

- Convert any webpage to PDF
- Memory-efficient streaming of PDF generation
- Robust image loading handling
- Clean and simple user interface
- Input validation and error handling

## Prerequisites

- Node.js 18 or later
- A Browserless.io account and API token

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd url-to-pdf
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the root directory and add your Browserless token:
   ```
   BROWSERLESS_TOKEN=your_token_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

## Usage

1. Open the application in your browser
2. Enter the URL of the webpage you want to convert to PDF
3. Click "Generate PDF"
4. The PDF will automatically download to your computer

## API Endpoint

The application exposes a single API endpoint:

```
POST /api/pdf
```

Request body:
```json
{
  "url": "https://example.com"
}
```

Response:
- Success: PDF file stream
- Error: JSON with error message

## Error Handling

The API will return appropriate error messages for:
- Invalid URLs
- Missing or invalid request body
- Failed PDF generation
- Missing Browserless token
