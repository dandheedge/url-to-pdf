import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url(),
  pageSize: z.enum(['a4', 'letter', 'custom']).default('a4'),
}).strict();

const pageSizes = {
  a4: { width: 8.27, height: 11.69 },
  letter: { width: 8.5, height: 11 },
  custom: { width: 8.27, height: 11.69 },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const result = requestSchema.safeParse(body);
    if (!result.success) {
      const error = result.error.errors[0];
      return NextResponse.json(
        { error: `Invalid request: ${error.message}` },
        { status: 400 }
      );
    }

    const { url, pageSize } = result.data;
    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    
    if (!browserlessToken) {
      console.error('Browserless token is missing from environment variables');
      return NextResponse.json(
        { error: 'Server configuration error: Browserless token not found' },
        { status: 500 }
      );
    }

    const browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${browserlessToken}`,
    });

    const page = await browser.newPage();
    
    // Set viewport based on page size
    const size = pageSizes[pageSize];
    await page.setViewport({
      width: Math.round(size.width * 96), // Convert inches to pixels
      height: Math.round(size.height * 96),
    });

    // Navigate to the page
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for all images to load
    await page.evaluate(async () => {
      const images = document.getElementsByTagName('img');
      await Promise.all(
        Array.from(images).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve); // Resolve even if image fails to load
          });
        })
      );
    });

    // Create a readable stream for the PDF
    const stream = await page.createPDFStream({
      format: pageSize.toUpperCase() as import('puppeteer').PaperFormat,
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    // Set response headers for PDF download
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');

    // Return the stream as a response
    console.log('Stream:', headers);
    return new NextResponse(stream as any, { headers });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
} 